// Serveur de production : sert l'app compilée (dist/) et fait les mêmes relais que le serveur de dev.
// - /blizzard/... : API Blizzard avec les clés du serveur (variables d'environnement BLIZZARD_*).
// - /wowhead/...  : recherche d'objets Wowhead (seule la recherche est relayée, pas tout le site).
// - /healthz      : sonde de vie pour Kubernetes.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { createBlizzardHandler } from './blizzard';
import { ResponseCache, TokenBuckets, clientIp, rateLimited } from './guard';
import { metrics, recordUpstream, registerCache, renderMetrics } from './metrics';

const PORT = Number(process.env.PORT ?? 8080);
// Métriques Prometheus sur un port à part, jamais exposé par l'ingress (0 pour les couper).
const METRICS_PORT = Number(process.env.METRICS_PORT ?? 9100);
const ROOT = resolve(process.env.STATIC_DIR ?? 'dist');

const blizzard = createBlizzardHandler({
  clientId: process.env.BLIZZARD_CLIENT_ID,
  clientSecret: process.env.BLIZZARD_CLIENT_SECRET,
  region: process.env.BLIZZARD_REGION,
  namespace: process.env.BLIZZARD_NAMESPACE,
});

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Seule la recherche d'objets est relayée vers Wowhead. */
const WOWHEAD_ALLOWED = /^\/forever(\/fr)?\/search\/suggestions-template$/;
// 120 recherches par minute et par IP, résultats gardés 10 min.
const wowheadLimit = new TokenBuckets(120, 2);
const wowheadCache = new ResponseCache(2000);
registerCache('wowhead', () => wowheadCache.size);

async function wowhead(req: IncomingMessage, res: ServerResponse, path: string) {
  const url = new URL(path, 'https://www.wowhead.com');
  if (req.method !== 'GET' || !WOWHEAD_ALLOWED.test(url.pathname)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end('{"error":"Chemin non autorisé"}');
  }
  const key = url.pathname + '?' + url.searchParams.toString().toLowerCase();
  if (!wowheadCache.get(key)) {
    const wait = wowheadLimit.take(clientIp(req));
    if (wait) {
      metrics.rateLimited.inc({ source: 'wowhead', scope: 'requests' });
      const r = rateLimited(wait, 'requests');
      res.writeHead(r.status, r.headers);
      return res.end(r.body);
    }
  }
  try {
    const { value, hit } = await wowheadCache.fetch(
      key,
      async () => {
        const upstream = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (theorycraft tool)' } }).catch((e) => {
          recordUpstream('wowhead', null);
          throw e;
        });
        recordUpstream('wowhead', upstream.status);
        return { status: upstream.status, body: await upstream.text(), contentType: upstream.headers.get('content-type') ?? 'application/json' };
      },
      (r) => (r.status === 200 ? 600_000 : 0),
    );
    metrics.cache.inc({ cache: 'wowhead', result: hit ? 'hit' : 'miss' });
    res.writeHead(value.status, { 'Content-Type': value.contentType, 'Cache-Control': 'public, max-age=600', 'X-Cache': hit ? 'HIT' : 'MISS' });
    res.end(value.body);
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: (e as Error).message }));
  }
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string) {
  // Chemin normalisé et confiné au dossier dist/.
  let file = normalize(join(ROOT, decodeURIComponent(pathname)));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }
  let info = await stat(file).catch(() => null);
  if (info?.isDirectory()) {
    file = join(file, 'index.html');
    info = await stat(file).catch(() => null);
  }
  // Application d'une seule page : toute route inconnue renvoie index.html.
  if (!info) {
    file = join(ROOT, 'index.html');
    info = await stat(file).catch(() => null);
    if (!info) {
      res.writeHead(404);
      return res.end('dist/ introuvable : lancez npm run build');
    }
  }
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  // Les fichiers de dist/assets ont un nom versionné : on peut les garder en cache longtemps.
  const cache = file.startsWith(join(ROOT, 'assets')) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': info.size, 'Cache-Control': cache });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const done = (p: Promise<unknown>) =>
    p.catch((e) => {
      if (!res.headersSent) res.writeHead(500);
      res.end(String((e as Error).message ?? e));
    });
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  if (url.pathname === '/blizzard' || url.pathname.startsWith('/blizzard/')) {
    metrics.requests.inc({ route: 'blizzard' });
    req.url = (req.url ?? '').slice('/blizzard'.length) || '/';
    return done(blizzard(req, res));
  }
  if (url.pathname.startsWith('/wowhead/')) {
    metrics.requests.inc({ route: 'wowhead' });
    return done(wowhead(req, res, (req.url ?? '').slice('/wowhead'.length)));
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  metrics.requests.inc({ route: url.pathname.startsWith('/assets/') ? 'assets' : 'page' });
  return done(serveStatic(req, res, url.pathname));
});

server.listen(PORT, () => console.log(`Forever Theorycraft sur le port ${PORT} (fichiers : ${ROOT})`));

const metricsServer =
  METRICS_PORT > 0
    ? createServer((req, res) => {
        if (req.url !== '/metrics') {
          res.writeHead(404);
          return res.end();
        }
        res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
        res.end(renderMetrics());
      }).listen(METRICS_PORT, () => console.log(`Métriques Prometheus sur le port ${METRICS_PORT}`))
    : null;

for (const sig of ['SIGTERM', 'SIGINT'] as const)
  process.on(sig, () => {
    metricsServer?.close();
    server.close(() => process.exit(0));
  });
