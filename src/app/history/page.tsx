"use client";

import { CheckoutHistory } from "@/components/CheckoutHistory";
import { HistoryEmblem, PageHeading } from "@/components/Emblems";

export default function HistoryPage() {
  return (
    <div className="animate-rise">
      <PageHeading title="Checkout history" tone="slate" icon={HistoryEmblem} />
      <p className="page-sub">
        Who grabbed what, how much, and when. Newest checkouts show first.
      </p>
      <CheckoutHistory />
    </div>
  );
}
