export type JobResult = 'done' | 'aborted' | 'alarm';

export interface DeviationStats {
  max: number;
  mean: number;
  p95: number;
  samples: number;
}

export interface JobRecord {
  id: string;
  file: string;
  startedAt: number;
  endedAt: number;
  /** Seconds */
  duration: number;
  estimate: number;
  tools: number[];
  materialId?: string;
  result: JobResult;
  alarms: number[];
  /** Mean feed override, percent */
  feedOverride: number;
  deviation: DeviationStats | null;
  /** Deviation over job time for the trend chart: [seconds, mm] */
  trend: [number, number][];
}

/**
 * Collects the Ist/Soll deviation during a job into a bounded number of time
 * buckets (mean per bucket) plus exact statistics.
 */
export class DeviationRecorder {
  private values: number[] = [];
  private buckets: { sum: number; count: number }[] = [];
  private bucketSeconds: number;

  constructor(
    private readonly maxPoints = 300,
    initialBucketSeconds = 1,
  ) {
    this.bucketSeconds = initialBucketSeconds;
  }

  add(seconds: number, deviation: number): void {
    this.values.push(deviation);
    let index = Math.floor(seconds / this.bucketSeconds);
    while (index >= this.maxPoints) {
      // Halve the resolution: merge neighbouring buckets.
      const merged: { sum: number; count: number }[] = [];
      for (let i = 0; i < this.buckets.length; i += 2) {
        const a = this.buckets[i]!;
        const b = this.buckets[i + 1] ?? { sum: 0, count: 0 };
        merged.push({ sum: a.sum + b.sum, count: a.count + b.count });
      }
      this.buckets = merged;
      this.bucketSeconds *= 2;
      index = Math.floor(seconds / this.bucketSeconds);
    }
    while (this.buckets.length <= index) this.buckets.push({ sum: 0, count: 0 });
    this.buckets[index]!.sum += deviation;
    this.buckets[index]!.count++;
  }

  trend(): [number, number][] {
    const out: [number, number][] = [];
    this.buckets.forEach((b, i) => {
      if (b.count > 0) out.push([i * this.bucketSeconds, Number((b.sum / b.count).toFixed(4))]);
    });
    return out;
  }

  stats(): DeviationStats | null {
    if (this.values.length === 0) return null;
    const sorted = [...this.values].sort((a, b) => a - b);
    const sum = sorted.reduce((s, v) => s + v, 0);
    return {
      max: sorted[sorted.length - 1]!,
      mean: sum / sorted.length,
      p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!,
      samples: sorted.length,
    };
  }
}

export interface WearTrend {
  /** Change of the mean deviation per 10 jobs, mm */
  slopePer10Jobs: number;
  baseline: number;
  latest: number;
  /** The machine is drifting: worth checking belts and screws */
  warning: boolean;
}

/**
 * Deviation history across jobs (the brief's "Abweichungs-Historie"): a
 * rising mean deviation points to belt wear or loose screws before parts
 * are scrap. Needs at least 5 completed jobs with measurements.
 */
export function wearTrend(records: readonly JobRecord[]): WearTrend | null {
  const points = records
    .filter((r) => r.result === 'done' && r.deviation)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((r) => r.deviation!.mean);
  if (points.length < 5) return null;
  const n = points.length;
  const meanX = (n - 1) / 2;
  const meanY = points.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  points.forEach((y, x) => {
    num += (x - meanX) * (y - meanY);
    den += (x - meanX) ** 2;
  });
  const slope = num / den;
  const baseline = points.slice(0, 3).reduce((s, v) => s + v, 0) / 3;
  const latest = points[n - 1]!;
  return {
    slopePer10Jobs: slope * 10,
    baseline,
    latest,
    warning: slope > 0 && latest > baseline * 1.5 && latest - baseline > 0.05,
  };
}

/** How good the time estimate was over the last jobs, as mean |error| in percent. */
export function estimateAccuracy(records: readonly JobRecord[]): number | null {
  const done = records.filter((r) => r.result === 'done' && r.estimate > 0 && r.duration > 0);
  if (done.length === 0) return null;
  const errors = done.map((r) => Math.abs(r.duration - r.estimate) / r.estimate);
  return (errors.reduce((s, v) => s + v, 0) / errors.length) * 100;
}
