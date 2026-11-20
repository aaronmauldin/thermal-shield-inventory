"use client";

import { JobsBrowser } from "@/components/JobsBrowser";
import { ChartEmblem, PageHeading } from "@/components/Emblems";

export default function JobsPage() {
  return (
    <div className="animate-rise">
      <PageHeading title="Material usage" tone="orange" icon={ChartEmblem} />
      <p className="page-sub">
        Track every material used on jobs — by day, week, or month — with
        averages from jobs that actually used stock.
      </p>
      <JobsBrowser />
    </div>
  );
}
