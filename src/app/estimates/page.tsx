"use client";

import { JobberEstimates } from "@/components/JobberEstimates";
import { CalendarEmblem, PageHeading } from "@/components/Emblems";

export default function EstimatesPage() {
  return (
    <div className="animate-rise">
      <PageHeading
        title="Upcoming material"
        tone="blue"
        icon={CalendarEmblem}
      />
      <p className="page-sub">
        Pick a date range, match Jobber line items to templates, and see
        materials needed.
      </p>
      <JobberEstimates />
    </div>
  );
}
