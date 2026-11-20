// Proxy local vers l'API officielle Blizzard (WoW Forever).
// Les clés restent côté serveur (fichier .env.local) : le navigateur n'appelle que /blizzard/...
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { ResponseCache, TokenBuckets, clientIp, rateLimited, type CachedResponse } from './guard';
import { metrics, recordUpstream, registerCache } from './metrics';

interface Options {
  clientId?: string;
  clientSecret?: string;
  region?: string;
  namespace?: string;
  /** Horloge (tests). */
  now?: () => number;
}

// Limites : 10 imports de personnage par minute et par IP, 300 requêtes par minute et par IP,
// et 30 000 requêtes par heure au total vers Blizzard (le quota est de 36 000).
export const LIMITS = {
  importsPerMinute: 10,
  requestsPerMinute: 300,
  globalPerHour: 30_000,
  globalBurst: 600,
};
// Durées de cache : fiche de personnage 5 min (elle change quand on s'équipe), données d'objets 24 h.
const PROFILE_TTL = 5 * 60_000;
const STATIC_TTL = 24 * 3600_000;
const IMPORT_PATH = /^\/profile\/wow\/character\/[^/]+$/;

// Chemins autorisés : recherche d'objets, fiche d'objet, icône, et profil public d'un personnage
// (fiche, équipement, talents). Rien d'autre ne passe.
const ALLOWED = [
  /^\/data\/wow\/search\/item$/,
  /^\/data\/wow\/item\/\d+$/,
  /^\/data\/wow\/media\/item\/\d+$/,
  /^\/profile\/wow\/character\/[^/]+(\/(equipment|specializations))?$/,
];

/** Gestionnaire HTTP des routes /blizzard/... (monté par Vite en dev, et par le serveur de production). */
export function createBlizzardHandler(opts: Options): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const region = (opts.region || 'eu').toLowerCase();
  const configured = !!(opts.clientId && opts.clientSecret);
  // Les rapports de développeurs divergent sur le nom du namespace : on essaie les deux formes.
  const candidates = [opts.namespace, `static-forever-${region}`, `static-1.60.1_70399-forever-${region}`].filter(Boolean) as string[];
  let namespace: string | null = opts.namespace || null;
  let token: { value: string; expires: number } | null = null;
  let namespaceFailure: { error: Error; until: number } | null = null;
  const now = opts.now ?? Date.now;
  const imports = new TokenBuckets(LIMITS.importsPerMinute, LIMITS.importsPerMinute / 60, now);
  const requests = new TokenBuckets(LIMITS.requestsPerMinute, LIMITS.requestsPerMinute / 60, now);
  const global = new TokenBuckets(LIMITS.globalBurst, LIMITS.globalPerHour / 3600, now);
  const cache = new ResponseCache(3000, now);
  registerCache('blizzard', () => cache.size);

  async function getToken(): Promise<string> {
    if (token && token.expires > Date.now() + 60_000) return token.value;
    const res = await fetch('https://oauth.battle.net/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new Error(res.status === 401 ? 'Clés Blizzard refusées (401)' : `Jeton Blizzard : ${res.status}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: json.access_token, expires: Date.now() + json.expires_in * 1000 };
    return token.value;
  }

  async function call(path: string, query: URLSearchParams, ns: string) {
    const url = new URL(`https://${region}.api.blizzard.com${path}`);
    query.forEach((v, k) => url.searchParams.set(k, v));
    url.searchParams.set('namespace', ns);
    const auth = `Bearer ${await getToken()}`;
    try {
      const r = await fetch(url, { headers: { Authorization: auth } });
      recordUpstream('blizzard', r.status);
      return r;
    } catch (e) {
      recordUpstream('blizzard', null);
      throw e;
    }
  }

  /** Trouve le namespace qui répond. On teste un index (beaucoup d'objets manquent dans l'API Forever). */
  async function resolveNamespace(): Promise<string> {
    if (namespace) return namespace;
    // Échec récent : on ne réessaie pas à chaque chargement de page.
    if (namespaceFailure && namespaceFailure.until > now()) throw namespaceFailure.error;
    const tried: string[] = [];
    for (const ns of candidates) {
      const res = await call('/data/wow/playable-class/index', new URLSearchParams(), ns);
      if (res.ok) return (namespace = ns);
      tried.push(`${ns} → ${res.status}`);
    }
    const error = new Error(`Aucun namespace Forever ne répond (${tried.join(', ')})`);
    namespaceFailure = { error, until: now() + 60_000 };
    throw error;
  }

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  };

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/status') {
      if (!configured) return send(res, 200, { configured: false });
      try {
        return send(res, 200, { configured: true, ok: true, region, namespace: await resolveNamespace() });
      } catch (e) {
        return send(res, 200, { configured: true, ok: false, region, error: (e as Error).message });
      }
    }
    if (!configured) return send(res, 503, { error: 'Clés Blizzard absentes (.env.local)' });
    const path = url.pathname.replace(/^\/api/, '');
    if (req.method !== 'GET' || !ALLOWED.some((re) => re.test(path))) return send(res, 403, { error: 'Chemin non autorisé' });
    const isProfile = path.startsWith('/profile/');
    const query = new URLSearchParams([...url.searchParams].sort(([a], [b]) => a.localeCompare(b)));
    const key = `${path.toLowerCase()}?${query}`;
    const reply = (r: CachedResponse, hit: boolean) => {
      res.statusCode = r.status;
      res.setHeader('Content-Type', r.contentType);
      res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
      metrics.cache.inc({ cache: 'blizzard', result: hit ? 'hit' : 'miss' });
      res.end(r.body);
    };
    const cached = cache.get(key);
    if (cached) return reply(cached, true);

    // Seules les requêtes qui partiraient vers Blizzard comptent dans les limites.
    const ip = clientIp(req);
    const limited = (wait: number, scope: 'import' | 'requests' | 'global') => {
      const r = rateLimited(wait, scope);
      console.warn(`[limite] ${scope} refusé pour ${ip} (${wait} s)`);
      metrics.rateLimited.inc({ source: 'blizzard', scope });
      res.writeHead(r.status, r.headers);
      res.end(r.body);
    };
    if (IMPORT_PATH.test(path)) {
      const wait = imports.take(ip);
      if (wait) return limited(wait, 'import');
    }
    const waitIp = requests.take(ip);
    if (waitIp) return limited(waitIp, 'requests');
    const waitAll = global.take('all');
    if (waitAll) return limited(waitAll, 'global');
    if (IMPORT_PATH.test(path)) metrics.imports.inc();

    try {
      const { value, hit } = await cache.fetch(
        key,
        async () => {
          // Les personnages Forever n'ont pas de royaume : namespace « profile-forever-{région} », slug « nom-surnom ».
          const ns = isProfile ? `profile-forever-${region}` : await resolveNamespace();
          const upstream = await call(path, query, ns);
          return { status: upstream.status, body: await upstream.text(), contentType: 'application/json; charset=utf-8' };
        },
        (r) => (r.status === 200 ? (isProfile ? PROFILE_TTL : STATIC_TTL) : r.status === 404 ? (isProfile ? 120_000 : 3600_000) : 0),
      );
      // Blizzard nous limite : on le dit au client sous la même forme que nos propres limites.
      if (value.status === 429) return limited(60, 'global');
      reply(value, hit);
    } catch (e) {
      send(res, 502, { error: (e as Error).message });
    }
  }

  return handle;
}

export function blizzardApi(opts: Options): Plugin {
  const handle = createBlizzardHandler(opts);
  // Ne rien renvoyer : Vite exécuterait une fonction renvoyée comme « post-hook ».
  const mount = (server: { middlewares: { use: (path: string, fn: (req: IncomingMessage, res: ServerResponse) => void) => unknown } }): void => {
    server.middlewares.use('/blizzard', (req, res) => void handle(req, res));
  };
  return { name: 'blizzard-api', configureServer: mount, configurePreviewServer: mount };
}
