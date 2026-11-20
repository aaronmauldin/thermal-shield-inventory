import Link from "next/link";

export function StockMissingNotice({
  showSettingsLink = false,
  hint = "Ask an admin to restore a backup.",
}: {
  showSettingsLink?: boolean;
  hint?: string;
}) {
  return (
    <div className="panel empty animate-rise">
      <h2>Stock data is missing</h2>
      <p>
        Nothing is stored for inventory yet, so sample materials and trucks were
        not created. Restore a backup to bring stock, trucks, and jobs back.
      </p>
      {showSettingsLink ? (
        <Link href="/settings" className="btn btn-primary">
          Restore a backup
        </Link>
      ) : (
        <p>{hint}</p>
      )}
    </div>
  );
}
