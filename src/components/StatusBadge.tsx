import { stockStatus, type InventoryItem } from "@/lib/types";

export function StatusBadge({ item }: { item: InventoryItem }) {
  const status = stockStatus(item);
  const label = status === "ok" ? "In stock" : status === "low" ? "Low" : "Out";
  const className =
    status === "ok" ? "badge badge-ok" : status === "low" ? "badge badge-low" : "badge badge-out";

  return <span className={className}>{label}</span>;
}
