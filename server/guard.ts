// Protection du quota des API externes (Blizzard : 36 000 requêtes par heure et 100 par seconde).
// - limites par IP (seaux à jetons) : imports de personnage et requêtes en général ;
// - plafond global pour toutes les requêtes qui partent vers l'API ;
// - cache mémoire des réponses, avec regroupement des requêtes identiques en cours.
import type { IncomingMessage } from 'node:http';

/** Seau à jetons : `capacity` jetons au maximum, rechargés à `perSecond` jetons par seconde. */
export class TokenBuckets {
  private buckets = new Map<string, { tokens: number; last: number }>();
  constructor(
    private capacity: number,
    private perSecond: number,
    private now: () => number = Date.now,
  ) {}

  /** Prend `cost` jetons. Renvoie 0 si c'est accepté, sinon le délai d'attente en secondes. */
  take(key: string, cost = 1): number {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, last: t };
    b.tokens = Math.min(this.capacity, b.tokens + ((t - b.last) / 1000) * this.perSecond);
    b.last = t;
    if (b.tokens < cost) {
      this.buckets.set(key, b);
      return Math.max(1, Math.ceil((cost - b.tokens) / this.perSecond));
    }
    b.tokens -= cost;
    this.buckets.set(key, b);
    if (this.buckets.size > 10_000) this.prune(t);
    return 0;
  }

  /** Oublie les seaux pleins (IP inactives) pour borner la mémoire. */
  private prune(t: number) {
    for (const [k, b] of this.buckets) {
      if (b.tokens + ((t - b.last) / 1000) * this.perSecond >= this.capacity) this.buckets.delete(k);
    }
  }
}

export interface CachedResponse {
  status: number;
  body: string;
  contentType: string;
}

/** Cache mémoire borné (les entrées les plus anciennes sortent en premier) avec regroupement des requêtes en cours. */
export class ResponseCache {
  private entries = new Map<string, { value: CachedResponse; expires: number }>();
  private pending = new Map<string, Promise<CachedResponse>>();
  constructor(
    private maxEntries = 3000,
    private now: () => number = Date.now,
  ) {}

  /** Nombre d'entrées (pour les métriques). */
  get size(): number {
    return this.entries.size;
  }

  get(key: string): CachedResponse | null {
    const e = this.entries.get(key);
    if (!e) return null;
    if (e.expires <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return e.value;
  }

  set(key: string, value: CachedResponse, ttlMs: number) {
    if (ttlMs <= 0) return;
    this.entries.delete(key);
    this.entries.set(key, { value, expires: this.now() + ttlMs });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value as string);
  }

  /** Réponse en cache, sinon une seule requête partagée par tous ceux qui demandent la même chose en même temps. */
  async fetch(key: string, load: () => Promise<CachedResponse>, ttl: (r: CachedResponse) => number): Promise<{ value: CachedResponse; hit: boolean }> {
    const cached = this.get(key);
    if (cached) return { value: cached, hit: true };
    let p = this.pending.get(key);
    if (p) return { value: await p, hit: true };
    p = load().then((r) => {
      this.set(key, r, ttl(r));
      return r;
    });
    this.pending.set(key, p);
    try {
      return { value: await p, hit: false };
    } finally {
      this.pending.delete(key);
    }
  }
}

/**
 * IP du visiteur. Le site passe par Nginx Proxy Manager puis Traefik : X-Real-IP (posé par le premier relais)
 * est l'adresse vue par ce relais, alors que le début de X-Forwarded-For peut être inventé par le client.
 * On prend donc X-Real-IP, sinon la dernière adresse de X-Forwarded-For, sinon l'adresse de la connexion.
 */
export function clientIp(req: IncomingMessage): string {
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();
  const xff = req.headers['x-forwarded-for'];
  const list = (Array.isArray(xff) ? xff.join(',') : xff ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length) return list[list.length - 1];
  return req.socket.remoteAddress ?? 'unknown';
}

/** Réponse 429 commune : le client affiche un message avec le délai. */
export function rateLimited(retryAfter: number, scope: 'import' | 'requests' | 'global'): { status: number; headers: Record<string, string>; body: string } {
  return {
    status: 429,
    headers: { 'Retry-After': String(retryAfter), 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ error: 'rate_limited', scope, retryAfter }),
  };
}
