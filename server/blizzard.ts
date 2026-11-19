// Proxy local vers l'API officielle Blizzard (WoW Forever).
// Les clés restent côté serveur (fichier .env.local) : le navigateur n'appelle que /blizzard/...
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

interface Options {
  clientId?: string;
  clientSecret?: string;
  region?: string;
  namespace?: string;
}

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
    return fetch(url, { headers: { Authorization: `Bearer ${await getToken()}` } });
  }

  /** Trouve le namespace qui répond. On teste un index (beaucoup d'objets manquent dans l'API Forever). */
  async function resolveNamespace(): Promise<string> {
    if (namespace) return namespace;
    const tried: string[] = [];
    for (const ns of candidates) {
      const res = await call('/data/wow/playable-class/index', new URLSearchParams(), ns);
      if (res.ok) return (namespace = ns);
      tried.push(`${ns} → ${res.status}`);
    }
    throw new Error(`Aucun namespace Forever ne répond (${tried.join(', ')})`);
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
    try {
      // Les personnages Forever n'ont pas de royaume : namespace « profile-forever-{région} », slug « nom-surnom ».
      const ns = path.startsWith('/profile/') ? `profile-forever-${region}` : await resolveNamespace();
      const upstream = await call(path, url.searchParams, ns);
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(await upstream.text());
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
