export const DEMO_USAGE_NOTE = "[demo-usage]";

export function isDemoUsageJob(job: { notes?: string | null }) {
  return (job.notes || "").includes(DEMO_USAGE_NOTE);
}
