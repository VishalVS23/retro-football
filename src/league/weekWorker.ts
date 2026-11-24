/// <reference lib="webworker" />
/**
 * Web Worker (Stage 4a): sims a week of league games off the main thread. See weekSim.ts.
 */
import { simGames, type WeekJob, type WeekRules } from './weekSim';

self.onmessage = (e: MessageEvent<{ id: number; jobs: WeekJob[]; rules: WeekRules }>) => {
  const { id, jobs, rules } = e.data;
  self.postMessage({ id, results: simGames(jobs, rules) });
};
