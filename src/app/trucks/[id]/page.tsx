"use client";

import { useParams } from "next/navigation";
import { TruckWorkspace } from "@/components/TruckWorkspace";

export default function TruckDetailPage() {
  const params = useParams<{ id: string }>();
  const truckId = String(params?.id || "");

  if (!truckId) {
    return (
      <div className="panel empty">
        <h2>Opening truck...</h2>
      </div>
    );
  }

  return <TruckWorkspace truckId={truckId} />;
}
