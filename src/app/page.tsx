"use client";

import { useEffect, useState } from "react";
import { InventoryDashboard } from "@/components/InventoryDashboard";
import type { Category, InventoryItem } from "@/lib/types";

export default function HomePage() {
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/items").then((res) => {
        if (!res.ok) throw new Error("Could not load inventory");
        return res.json();
      }),
      fetch("/api/categories").then((res) => {
        if (!res.ok) throw new Error("Could not load categories");
        return res.json();
      }),
    ])
      .then(([nextItems, nextCategories]) => {
        if (cancelled) return;
        setItems(nextItems);
        setCategories(nextCategories);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load inventory");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="panel empty animate-rise">
        <h2>Couldn’t load inventory</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!items) {
    return (
      <div className="panel empty animate-rise" aria-live="polite">
        <h2>Loading stock...</h2>
        <p>Pulling up your materials list.</p>
      </div>
    );
  }

  return <InventoryDashboard initialItems={items} categories={categories} />;
}
