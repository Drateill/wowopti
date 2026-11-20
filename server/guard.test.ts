import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIMITS, createBlizzardHandler } from './blizzard';
import { ResponseCache, TokenBuckets, clientIp } from './guard';

describe('seaux à jetons', () => {
  it('accepte jusqu’à la capacité puis donne le délai, et se recharge', () => {
    let t = 0;
    const b = new TokenBuckets(3, 1, () => t);
    expect([b.take('a'), b.take('a'), b.take('a')]).toEqual([0, 0, 0]);
    expect(b.take('a')).toBe(1);
    expect(b.take('b')).toBe(0);
    t = 2000;
    expect(b.take('a')).toBe(0);
    expect(b.take('a')).toBe(0);
    expect(b.take('a')).toBe(1);
  });
});

describe('cache', () => {
  it('expire, borne sa taille et regroupe les requêtes identiques', async () => {
    let t = 0;
    const c = new ResponseCache(2, () => t);
    const r = { status: 200, body: 'x', contentType: 'a' };
    c.set('k', r, 1000);
    expect(c.get('k')).toBe(r);
    t = 1000;
    expect(c.get('k')).toBeNull();
    c.set('a', r, 1e6);
    c.set('b', r, 1e6);
    c.set('c', r, 1e6);
    expect(c.get('a')).toBeNull();
    let calls = 0;
    const load = async () => {
      calls++;
      return r;
    };
    const [x, y] = await Promise.all([c.fetch('z', load, () => 1e6), c.fetch('z', load, () => 1e6)]);
    expect(calls).toBe(1);
    expect([x.hit, y.hit]).toEqual([false, true]);
  });
});

describe('IP du client', () => {
  const req = (headers: Record<string, string>) => ({ headers, socket: { remoteAddress: '10.0.0.1' } }) as unknown as IncomingMessage;
  it('préfère X-Real-IP, puis la dernière adresse de X-Forwarded-For (le début peut être inventé)', () => {
    expect(clientIp(req({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' }))).toBe('1.2.3.4');
    expect(clientIp(req({ 'x-forwarded-for': '6.6.6.6, 5.5.5.5' }))).toBe('5.5.5.5');
    expect(clientIp(req({}))).toBe('10.0.0.1');
  });
});

describe('relais Blizzard protégé', () => {
  afterEach(() => vi.unstubAllGlobals());

  function setup() {
    let t = 0;
    const upstream: string[] = [];
    vi.stubGlobal('fetch', async (url: string | URL) => {
      const u = String(url);
      if (u.includes('oauth')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 86400 }));
      upstream.push(new URL(u).pathname);
      return new Response(u.includes('inconnu') ? '{}' : '{"ok":true}', { status: u.includes('inconnu') ? 404 : 200 });
    });
    const handle = createBlizzardHandler({ clientId: 'id', clientSecret: 'secret', region: 'eu', namespace: 'static-forever-eu', now: () => t });
    const get = async (path: string, ip = '1.1.1.1') => {
      const req = { url: path, method: 'GET', headers: { 'x-real-ip': ip }, socket: {} } as unknown as IncomingMessage;
      const out = { status: 0, headers: {} as Record<string, string>, body: '' };
      const res = {
        set statusCode(s: number) { out.status = s; },
        setHeader: (k: string, v: string) => { out.headers[k.toLowerCase()] = v; },
        writeHead: (s: number, h: Record<string, string>) => {
          out.status = s;
          for (const [k, v] of Object.entries(h)) out.headers[k.toLowerCase()] = v;
        },
        end: (b?: string) => { out.body = b ?? ''; },
      } as unknown as ServerResponse;
      await handle(req, res);
      return out;
    };
    return { get, upstream, advance: (ms: number) => (t += ms) };
  }

  it('met en cache : un même personnage ne repart pas vers Blizzard', async () => {
    const { get, upstream } = setup();
    const a = await get('/api/profile/wow/character/judy');
    const b = await get('/api/profile/wow/character/Judy');
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.headers['x-cache'], b.headers['x-cache']]).toEqual(['MISS', 'HIT']);
    expect(upstream).toHaveLength(1);
  });

  it(`limite à ${LIMITS.importsPerMinute} imports par minute et par IP, avec Retry-After`, async () => {
    const { get, advance } = setup();
    for (let i = 0; i < LIMITS.importsPerMinute; i++) expect((await get(`/api/profile/wow/character/perso${i}`)).status).toBe(200);
    const refused = await get('/api/profile/wow/character/encore');
    expect(refused.status).toBe(429);
    expect(JSON.parse(refused.body)).toMatchObject({ error: 'rate_limited', scope: 'import' });
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    // Une autre IP n'est pas touchée, le cache reste servi, et la limite se recharge.
    expect((await get('/api/profile/wow/character/encore', '2.2.2.2')).status).toBe(200);
    expect((await get('/api/profile/wow/character/perso0')).status).toBe(200);
    advance(6_000);
    expect((await get('/api/profile/wow/character/encore2')).status).toBe(200);
  });

  it('garde les 404 en cache peu de temps', async () => {
    const { get, upstream, advance } = setup();
    expect((await get('/api/profile/wow/character/inconnu')).status).toBe(404);
    await get('/api/profile/wow/character/inconnu');
    expect(upstream).toHaveLength(1);
    advance(121_000);
    await get('/api/profile/wow/character/inconnu');
    expect(upstream).toHaveLength(2);
  });
});
