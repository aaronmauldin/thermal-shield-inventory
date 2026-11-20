"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  categoryName,
  type Category,
  type CheckoutRecord,
} from "@/lib/types";

export function CheckoutHistory() {
  const [checkouts, setCheckouts] = useState<CheckoutRecord[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/checkouts").then((res) => {
        if (!res.ok) throw new Error("Could not load history");
        return res.json();
      }),
      fetch("/api/categories").then((res) => (res.ok ? res.json() : [])),
    ])
      .then(([nextCheckouts, nextCategories]) => {
        if (cancelled) return;
        setCheckouts(nextCheckouts);
        setCategories(nextCategories);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load history");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    if (!checkouts) return [];
    const q = query.trim().toLowerCase();
    if (!q) return checkouts;
    return checkouts.filter(
      (entry) =>
        entry.employeeName.toLowerCase().includes(q) ||
        entry.itemName.toLowerCase().includes(q) ||
        (entry.truckName || "").toLowerCase().includes(q)
    );
  }, [checkouts, query]);

  if (error) {
    return (
      <div className="panel empty animate-rise">
        <h2>Couldn’t load history</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!checkouts) {
    return (
      <div className="panel empty animate-rise">
        <h2>Loading history...</h2>
        <p>Pulling checkout logs.</p>
      </div>
    );
  }

  return (
    <div>
      <section className="panel filters animate-rise" style={{ marginBottom: 14 }}>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label htmlFor="history-search">Search</label>
          <input
            id="history-search"
            placeholder="Employee or material"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Link href="/checkout" className="btn btn-primary">
          Check out
        </Link>
      </section>

      {visible.length === 0 ? (
        <div className="panel empty animate-rise">
          <h2>No checkouts yet</h2>
          <p>When someone grabs material, it will show up here.</p>
          <Link href="/checkout" className="btn btn-primary">
            Check out material
          </Link>
        </div>
      ) : (
        <section className="item-list">
          {visible.map((entry, index) => (
            <article
              key={entry.id}
              className="panel item-row animate-rise"
              style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
            >
              <div className="item-main">
                <div className="item-title-row">
                  <h2 className="item-name" style={{ margin: 0 }}>
                    {entry.itemName}
                  </h2>
                  <span
                    className={`badge ${
                      entry.kind === "return"
                        ? "badge-low"
                        : entry.kind === "transfer"
                          ? "badge-ok"
                          : "badge-ok"
                    }`}
                  >
                    {entry.kind === "return" ? "+" : "−"}
                    {entry.quantity} {entry.unit}
                  </span>
                </div>
                <div className="item-meta">
                  <span>
                    {entry.kind === "return"
                      ? `${entry.employeeName} returned to stock`
                      : entry.kind === "transfer"
                        ? `${entry.employeeName} moved trucks`
                        : entry.employeeName}
                  </span>
                  {entry.truckName ? <span>{entry.truckName}</span> : null}
                  <span>{categoryName(categories, entry.categoryId)}</span>
                  <span>{formatWhen(entry.createdAt)}</span>
                  {entry.kind === "transfer" ? null : (
                    <span>
                      {entry.kind === "return" ? "Now" : "Left"}{" "}
                      {entry.quantityAfter} {entry.unit}
                    </span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
