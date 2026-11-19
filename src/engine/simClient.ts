import type { AnySimConfig } from '../state/store';
import type { SimResult, StatWeight } from './simTypes';

type SimConfig = AnySimConfig;

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (p: number) => void };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const msg = e.data;
    const p = pending.get(msg.id);
    if (!p) return;
    if ('progress' in msg) {
      p.onProgress?.(msg.progress);
      return;
    }
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(msg.error));
  };
  return worker;
}

function call<T>(payload: object, onProgress?: (p: number) => void): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
    getWorker().postMessage({ id, ...payload });
  });
}

export const runSim = (config: SimConfig, onProgress?: (p: number) => void) =>
  call<SimResult>({ kind: 'sim', config }, onProgress);

export const runWeights = (config: SimConfig, onProgress?: (p: number) => void) =>
  call<{ base: SimResult; weights: StatWeight[] }>({ kind: 'weights', config }, onProgress);

export const runCompare = (configs: SimConfig[], onProgress?: (p: number) => void) =>
  call<SimResult[]>({ kind: 'compare', configs }, onProgress);
