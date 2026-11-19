/// <reference lib="webworker" />
import type { AnySimConfig } from '../state/store';
import { simulateAny, statWeightsAny } from './sim';

export type WorkerRequest =
  | { id: number; kind: 'sim'; config: AnySimConfig }
  | { id: number; kind: 'weights'; config: AnySimConfig }
  | { id: number; kind: 'compare'; configs: AnySimConfig[] };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.kind === 'sim') {
      self.postMessage({ id: req.id, ok: true, result: simulateAny(req.config) });
    } else if (req.kind === 'weights') {
      const result = statWeightsAny(req.config, (done, total) => self.postMessage({ id: req.id, progress: done / total }));
      self.postMessage({ id: req.id, ok: true, result });
    } else {
      const results = req.configs.map((c, i) => {
        const r = simulateAny(c);
        self.postMessage({ id: req.id, progress: (i + 1) / req.configs.length });
        return r;
      });
      self.postMessage({ id: req.id, ok: true, result: results });
    }
  } catch (err) {
    self.postMessage({ id: req.id, ok: false, error: String(err) });
  }
};
