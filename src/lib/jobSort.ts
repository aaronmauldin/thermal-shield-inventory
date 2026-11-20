import type { JobRecord } from "./types";

/** Jobber schedule and truck lists use Eastern time. */
export const JOB_TIMEZONE = "America/New_York";

export function formatYmdInZone(
  iso: string | null | undefined,
  timeZone = JOB_TIMEZONE
): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(t);
}

export function todayYmd(timeZone = JOB_TIMEZONE): string {
  return formatYmdInZone(new Date().toISOString(), timeZone) || "";
}

export function addDaysYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function jobScheduleIso(
  job: Pick<JobRecord, "scheduledAt" | "createdAt">
): string {
  return job.scheduledAt || job.createdAt;
}

export function compareJobsBySchedule(a: JobRecord, b: JobRecord): number {
  const today = todayYmd();
  const dayA = formatYmdInZone(jobScheduleIso(a)) || "9999-99-99";
  const dayB = formatYmdInZone(jobScheduleIso(b)) || "9999-99-99";
  const rank = (day: string) => {
    if (day === today) return 0;
    if (day > today && day < "9999-99-99") return 1;
    if (day < today) return 2;
    return 3;
  };
  const rankA = rank(dayA);
  const rankB = rank(dayB);
  if (rankA !== rankB) return rankA - rankB;
  if (rankA === 2 && dayA !== dayB) return dayB.localeCompare(dayA);
  if (dayA !== dayB) return dayA.localeCompare(dayB);
  const timeA = new Date(jobScheduleIso(a)).getTime();
  const timeB = new Date(jobScheduleIso(b)).getTime();
  if (timeA !== timeB) return timeA - timeB;
  return a.name.localeCompare(b.name);
}

export function formatJobDateLabel(iso: string | null | undefined): string {
  const ymd = formatYmdInZone(iso);
  if (!ymd) return "";
  const today = todayYmd();
  if (ymd === today) return "Today";
  if (ymd === addDaysYmd(today, 1)) return "Tomorrow";
  if (ymd === addDaysYmd(today, -1)) return "Yesterday";
  const t = new Date(iso || "");
  if (!Number.isFinite(t.getTime())) return ymd;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: JOB_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(t);
}

export function normalizePersonName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[\u2018\u2019\u201b\u2032'`]/g, "")
    .replace(/[._\-,]+/g, " ")
    .replace(/\s+/g, " ");
}

export function parseJobberNameList(value: unknown): string[] {
  const parts = Array.isArray(value)
    ? value.map((entry) => String(entry || ""))
    : String(value || "").split(/[,;\n]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = normalizePersonName(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
