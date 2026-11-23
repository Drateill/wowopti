import type { AnySimConfig } from '../state/store';
import type { Evaluation } from './optimizer';

// Plusieurs workers de simulation en parallèle, pour l'optimiseur de rotation.

type Job = { resolve: (v: Evaluation[]) => void; reject: (e: Error) => void };

const size = () => Math.max(1, Math.min(8, (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2) - 1));

let workers: Worker[] = [];
let nextId = 1;
const jobs = new Map<number, Job>();

function pool(): Worker[] {
  if (workers.length) return workers;
  workers = Array.from({ length: size() }, () => {
    const w = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const msg = e.data;
      const job = jobs.get(msg.id);
      if (!job || 'progress' in msg) return;
      jobs.delete(msg.id);
      if (msg.ok) job.resolve(msg.result);
      else job.reject(new Error(msg.error));
    };
    return w;
  });
  return workers;
}

function send(w: Worker, configs: AnySimConfig[]): Promise<Evaluation[]> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    jobs.set(id, { resolve, reject });
    w.postMessage({ id, kind: 'dps', configs });
  });
}

/** Simule un lot de configurations, réparti sur les workers ; les résultats gardent l'ordre du lot. */
export async function evaluateConfigs(configs: AnySimConfig[]): Promise<Evaluation[]> {
  const ws = pool();
  const chunks = ws.map(() => [] as number[]);
  configs.forEach((_, i) => chunks[i % ws.length].push(i));
  const parts = await Promise.all(chunks.map((idx, k) => (idx.length ? send(ws[k], idx.map((i) => configs[i])) : Promise.resolve([]))));
  const out = new Array<Evaluation>(configs.length);
  chunks.forEach((idx, k) => idx.forEach((i, j) => (out[i] = parts[k][j])));
  return out;
}

/** Arrête net tous les calculs en cours (bouton « Arrêter »). */
export function stopPool() {
  for (const w of workers) w.terminate();
  workers = [];
  for (const job of jobs.values()) job.reject(new Error('arrêté'));
  jobs.clear();
}
