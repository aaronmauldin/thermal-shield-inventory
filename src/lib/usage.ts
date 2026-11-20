import type { JobMaterial, JobRecord } from "./types";
import { formatYmdInZone, jobScheduleIso } from "./jobSort";

export type PeriodMode = "day" | "week" | "month";

export type PeriodBucket = {
  key: string;
  label: string;
  start: Date;
  end: Date;
  bags: number;
  units: number;
  jobs: number;
  byMaterial: Record<string, { name: string; unit: string; quantity: number }>;
};

export type MaterialAverage = {
  key: string;
  name: string;
  unit: string;
  total: number;
  jobsWithIt: number;
  avgPerJob: number;
  avgPerPeriod: number;
  periodsSeen: number;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Calendar date of the job in Eastern time, as local midnight. */
export function jobWhen(job: JobRecord): Date {
  const ymd = formatYmdInZone(jobScheduleIso(job));
  if (ymd) {
    const [year, month, day] = ymd.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const fallback = new Date(job.createdAt);
  return Number.isNaN(fallback.getTime()) ? new Date() : startOfDay(fallback);
}

function isBagLine(item: { unit: string; itemName: string }) {
  return (
    /bag/i.test(item.unit) ||
    /bag/i.test(item.itemName) ||
    /insul/i.test(item.itemName)
  );
}

/** Materials used on a job, including bag-tally insulation if it was not stored as a line. */
export function materialsOnJob(job: JobRecord): JobMaterial[] {
  const materials = (job.materials || []).filter((item) => Number(item.quantity) > 0);
  const bags = job.bagCount || 0;
  if (bags <= 0) return materials;
  const recordedBags = materials
    .filter(isBagLine)
    .reduce((sum, item) => sum + Number(item.quantity), 0);
  if (recordedBags >= bags) return materials;
  return [
    ...materials,
    {
      itemId: "_insulation-bags",
      itemName: "Insulation bags",
      quantity: bags - recordedBags,
      unit: "bags",
    },
  ];
}

export function jobHasUsage(job: JobRecord): boolean {
  return materialsOnJob(job).length > 0;
}

/** Week starts Monday (local). */
export function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

export function startOfMonth(d: Date) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

export function startOfPeriod(d: Date, mode: PeriodMode) {
  if (mode === "month") return startOfMonth(d);
  if (mode === "week") return startOfWeek(d);
  return startOfDay(d);
}

export function endOfPeriod(start: Date, mode: PeriodMode) {
  const end = new Date(start);
  if (mode === "month") end.setMonth(end.getMonth() + 1);
  else if (mode === "week") end.setDate(end.getDate() + 7);
  else end.setDate(end.getDate() + 1);
  return end;
}

export function periodKey(date: Date, mode: PeriodMode): string {
  const start = startOfPeriod(date, mode);
  if (mode === "month") {
    return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  }
  if (mode === "week") {
    return `${start.getFullYear()}-W${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  }
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
}

export function periodLabel(date: Date, mode: PeriodMode): string {
  if (mode === "month") {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      year: "numeric",
    }).format(date);
  }
  if (mode === "day") {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(date);
  }
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

function materialKey(itemId: string, name: string, unit: string) {
  return itemId || `${name}::${unit}`;
}

function emptyBucket(start: Date, mode: PeriodMode): PeriodBucket {
  return {
    key: periodKey(start, mode),
    label: periodLabel(start, mode),
    start: new Date(start),
    end: endOfPeriod(start, mode),
    bags: 0,
    units: 0,
    jobs: 0,
    byMaterial: {},
  };
}

function maxPeriodsFor(mode: PeriodMode) {
  if (mode === "day") return 14;
  if (mode === "week") return 12;
  return 8;
}

/** Build continuous day/week/month buckets covering jobs that actually used material. */
export function buildPeriodBuckets(
  jobs: JobRecord[],
  mode: PeriodMode,
  maxPeriods = maxPeriodsFor(mode)
): PeriodBucket[] {
  const usedJobs = jobs.filter(jobHasUsage);
  if (usedJobs.length === 0) return [];

  const map = new Map<string, PeriodBucket>();

  for (const job of usedJobs) {
    const when = jobWhen(job);
    if (Number.isNaN(when.getTime())) continue;
    const start = startOfPeriod(when, mode);
    const key = periodKey(when, mode);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = emptyBucket(start, mode);
      map.set(key, bucket);
    }
    bucket.jobs += 1;
    bucket.bags += job.bagCount || 0;

    for (const mat of materialsOnJob(job)) {
      const qty = Number(mat.quantity) || 0;
      if (qty <= 0) continue;
      bucket.units += qty;
      const mk = materialKey(mat.itemId, mat.itemName, mat.unit);
      const existing = bucket.byMaterial[mk];
      if (existing) {
        existing.quantity += qty;
      } else {
        bucket.byMaterial[mk] = {
          name: mat.itemName,
          unit: mat.unit,
          quantity: qty,
        };
      }
    }
  }

  const now = startOfPeriod(new Date(), mode);
  let earliest = now;
  for (const b of map.values()) {
    if (b.start < earliest) earliest = b.start;
  }

  const filled: PeriodBucket[] = [];
  const cursor = new Date(earliest);
  while (cursor <= now) {
    const key = periodKey(cursor, mode);
    filled.push(map.get(key) || emptyBucket(new Date(cursor), mode));
    if (mode === "week") cursor.setDate(cursor.getDate() + 7);
    else if (mode === "month") cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + 1);
  }

  return filled.slice(-maxPeriods);
}

export function jobsInBucketWindow(
  jobs: JobRecord[],
  buckets: PeriodBucket[]
): JobRecord[] {
  if (buckets.length === 0) return [];
  const start = buckets[0].start.getTime();
  const end = buckets[buckets.length - 1].end.getTime();
  return jobs.filter((job) => {
    const t = jobWhen(job).getTime();
    return t >= start && t < end;
  });
}

export function materialAverages(
  jobs: JobRecord[],
  buckets: PeriodBucket[]
): MaterialAverage[] {
  const windowJobs = jobsInBucketWindow(jobs, buckets).filter(jobHasUsage);
  const totals = new Map<
    string,
    { name: string; unit: string; total: number; jobsWithIt: number }
  >();

  for (const job of windowJobs) {
    const seen = new Set<string>();
    for (const mat of materialsOnJob(job)) {
      const qty = Number(mat.quantity) || 0;
      if (qty <= 0) continue;
      const key = materialKey(mat.itemId, mat.itemName, mat.unit);
      const cur = totals.get(key) || {
        name: mat.itemName,
        unit: mat.unit,
        total: 0,
        jobsWithIt: 0,
      };
      cur.total += qty;
      if (!seen.has(key)) {
        cur.jobsWithIt += 1;
        seen.add(key);
      }
      totals.set(key, cur);
    }
  }

  return [...totals.entries()]
    .map(([key, row]) => {
      let periodsSeen = 0;
      for (const b of buckets) {
        if (b.byMaterial[key]?.quantity) periodsSeen += 1;
      }
      const jobDenom = Math.max(1, row.jobsWithIt);
      const periodDenom = Math.max(1, periodsSeen);
      return {
        key,
        name: row.name,
        unit: row.unit,
        total: row.total,
        jobsWithIt: row.jobsWithIt,
        avgPerJob: Math.round((row.total / jobDenom) * 10) / 10,
        avgPerPeriod: Math.round((row.total / periodDenom) * 10) / 10,
        periodsSeen,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function usageSummary(jobs: JobRecord[], buckets: PeriodBucket[]) {
  const windowJobs = jobsInBucketWindow(jobs, buckets).filter(jobHasUsage);
  const jobCount = windowJobs.length;
  let bags = 0;
  let units = 0;
  for (const job of windowJobs) {
    bags += job.bagCount || 0;
    for (const mat of materialsOnJob(job)) {
      units += Number(mat.quantity) || 0;
    }
  }
  const activePeriods = buckets.filter((b) => b.units > 0).length || 1;
  return {
    jobCount,
    bags,
    units,
    avgBagsPerJob: jobCount ? Math.round((bags / jobCount) * 10) / 10 : 0,
    avgBagsPerPeriod: Math.round((bags / activePeriods) * 10) / 10,
    avgUnitsPerJob: jobCount ? Math.round((units / jobCount) * 10) / 10 : 0,
    avgUnitsPerPeriod: Math.round((units / activePeriods) * 10) / 10,
    activePeriods,
  };
}

export function formatQty(n: number) {
  const r = Math.round(n * 100) / 100;
  if (Number.isInteger(r)) return String(r);
  return String(r);
}

export function periodWord(mode: PeriodMode) {
  if (mode === "day") return "day";
  if (mode === "week") return "week";
  return "month";
}
