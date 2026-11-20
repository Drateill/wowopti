// Erreur renvoyée quand le serveur refuse une requête pour protéger le quota des API (réponse 429).

export type RateLimitScope = 'import' | 'requests' | 'global';

export class RateLimitedError extends Error {
  constructor(
    public scope: RateLimitScope,
    public retryAfter: number,
  ) {
    super(`rate_limited:${scope}:${retryAfter}`);
    this.name = 'RateLimitedError';
  }
}

/** Lit une réponse 429 (la nôtre ou celle d'un relais) et en fait une RateLimitedError. */
export async function rateLimitError(res: Response): Promise<RateLimitedError> {
  const body = (await res.json().catch(() => ({}))) as { scope?: RateLimitScope; retryAfter?: number };
  const header = Number(res.headers.get('Retry-After'));
  const wait = body.retryAfter ?? (Number.isFinite(header) && header > 0 ? header : 60);
  return new RateLimitedError(body.scope ?? 'global', Math.max(1, Math.round(wait)));
}
