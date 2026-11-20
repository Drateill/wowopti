// Métriques Prometheus du serveur, au format texte, sans dépendance.
// Servies sur un port à part (METRICS_PORT, 9100 par défaut) qui n'est pas exposé par l'ingress.

type Labels = Record<string, string>;

const key = (labels: Labels) =>
  Object.keys(labels)
    .sort()
    .map((k) => `${k}="${labels[k].replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`)
    .join(',');

abstract class Metric {
  protected values = new Map<string, number>();
  constructor(
    readonly name: string,
    readonly help: string,
    readonly type: 'counter' | 'gauge',
  ) {}

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} ${this.type}`];
    for (const [k, v] of this.values) lines.push(`${this.name}${k ? `{${k}}` : ''} ${v}`);
    return lines.join('\n');
  }

  get(labels: Labels = {}): number {
    return this.values.get(key(labels)) ?? 0;
  }
}

export class Counter extends Metric {
  constructor(name: string, help: string) {
    super(name, help, 'counter');
  }
  inc(labels: Labels = {}, by = 1) {
    const k = key(labels);
    this.values.set(k, (this.values.get(k) ?? 0) + by);
  }
}

export class Gauge extends Metric {
  constructor(
    name: string,
    help: string,
    private collect?: () => [Labels, number][],
  ) {
    super(name, help, 'gauge');
  }
  set(labels: Labels, v: number) {
    this.values.set(key(labels), v);
  }
  render(): string {
    if (this.collect) for (const [l, v] of this.collect()) this.set(l, v);
    return super.render();
  }
}

/** Compte des événements sur une fenêtre glissante (ex. requêtes Blizzard de la dernière heure). */
export class SlidingWindow {
  private stamps: number[] = [];
  constructor(
    private windowMs: number,
    private now: () => number = Date.now,
  ) {}
  add() {
    this.stamps.push(this.now());
    if (this.stamps.length > 100_000) this.trim();
  }
  count(): number {
    this.trim();
    return this.stamps.length;
  }
  private trim() {
    const min = this.now() - this.windowMs;
    let i = 0;
    while (i < this.stamps.length && this.stamps[i] <= min) i++;
    if (i) this.stamps.splice(0, i);
  }
}

/** Quota horaire de l'API Blizzard. */
export const BLIZZARD_HOURLY_QUOTA = 36_000;

const blizzardLastHour = new SlidingWindow(3600_000);
const cacheSizes = new Map<string, () => number>();

export const metrics = {
  requests: new Counter('wowopti_requests_total', 'Requêtes reçues par le serveur, par route.'),
  cache: new Counter('wowopti_cache_requests_total', 'Requêtes relayées servies depuis le cache (hit) ou non (miss).'),
  rateLimited: new Counter('wowopti_rate_limited_total', 'Requêtes refusées par les limites (429), par source et portée.'),
  upstream: new Counter('wowopti_upstream_requests_total', 'Appels sortants vers Blizzard et Wowhead, par classe de statut.'),
  imports: new Counter('wowopti_character_imports_total', 'Imports de personnage demandés à Blizzard (hors cache).'),
};

const gauges = [
  new Gauge('wowopti_blizzard_requests_last_hour', 'Appels à l’API Blizzard sur la dernière heure glissante.', () => [[{}, blizzardLastHour.count()]]),
  new Gauge('wowopti_blizzard_hourly_quota', 'Quota horaire de l’API Blizzard.', () => [[{}, BLIZZARD_HOURLY_QUOTA]]),
  new Gauge('wowopti_cache_entries', 'Entrées dans les caches mémoire.', () => [...cacheSizes].map(([cache, size]) => [{ cache }, size()])),
];

/** Classe de statut : 2xx, 3xx, 4xx, 429, 5xx ou error (réseau). */
export const statusClass = (status: number | null) => (status === null ? 'error' : status === 429 ? '429' : `${Math.floor(status / 100)}xx`);

/** Appel sortant vers une API externe. */
export function recordUpstream(api: 'blizzard' | 'wowhead', status: number | null) {
  metrics.upstream.inc({ api, status: statusClass(status) });
  if (api === 'blizzard') blizzardLastHour.add();
}

export function registerCache(name: string, size: () => number) {
  cacheSizes.set(name, size);
}

export function renderMetrics(): string {
  const process_ = [
    '# HELP wowopti_process_resident_memory_bytes Mémoire résidente du processus.',
    '# TYPE wowopti_process_resident_memory_bytes gauge',
    `wowopti_process_resident_memory_bytes ${process.memoryUsage().rss}`,
    '# HELP wowopti_process_uptime_seconds Durée depuis le démarrage du processus.',
    '# TYPE wowopti_process_uptime_seconds gauge',
    `wowopti_process_uptime_seconds ${Math.round(process.uptime())}`,
  ];
  return [...Object.values(metrics).map((m) => m.render()), ...gauges.map((g) => g.render()), ...process_].join('\n') + '\n';
}
