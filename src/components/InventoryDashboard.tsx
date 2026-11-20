"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { compressPhoto } from "@/lib/compressPhoto";
import {
  categoryName,
  stockStatus,
  type Category,
  type InventoryItem,
} from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import {
  CheckEmblem,
  InventoryEmblem,
  WarnEmblem,
} from "@/components/Emblems";

type Props = {
  initialItems: InventoryItem[];
  categories: Category[];
};

export function InventoryDashboard({ initialItems, categories }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | string>("all");
  const [filter, setFilter] = useState<"all" | "attention">("all");
  const [items, setItems] = useState(initialItems);
  const [photoError, setPhotoError] = useState("");

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const stats = useMemo(() => {
    const low = items.filter((item) => stockStatus(item) === "low").length;
    const out = items.filter((item) => stockStatus(item) === "out").length;
    return {
      total: items.length,
      attention: low + out,
      ok: items.length - low - out,
    };
  }, [items]);

  const needsAttention = useMemo(
    () => items.filter((item) => stockStatus(item) !== "ok"),
    [items]
  );

  const visible = useMemo(() => {
    return items.filter((item) => {
      const matchesQuery =
        !query ||
        item.name.toLowerCase().includes(query.toLowerCase()) ||
        item.location.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = category === "all" || item.category === category;
      const matchesFilter = filter === "all" || stockStatus(item) !== "ok";
      return matchesQuery && matchesCategory && matchesFilter;
    });
  }, [items, query, category, filter]);

  function applyItem(next: InventoryItem) {
    setItems((prev) => prev.map((row) => (row.id === next.id ? next : row)));
  }

  return (
    <div className="dashboard">
      <div className="page-title-block animate-rise">
        <div>
          <h1 className="page-title">Stock</h1>
          <p className="page-lead">Know what&apos;s on the truck.</p>
        </div>
      </div>

      <section className="stat-pills animate-rise animate-rise-delay-1">
        <article className="stat-pill">
          <span className="stat-pill-icon blue" aria-hidden>
            <InventoryEmblem size={20} />
          </span>
          <strong>{stats.total}</strong>
          <span>SKUs</span>
        </article>
        <article className="stat-pill">
          <span className="stat-pill-icon ok" aria-hidden>
            <CheckEmblem size={20} />
          </span>
          <strong>{stats.ok}</strong>
          <span>Healthy</span>
        </article>
        <article className={`stat-pill${stats.attention ? " pulse-warn" : ""}`}>
          <span className="stat-pill-icon warn" aria-hidden>
            <WarnEmblem size={20} />
          </span>
          <strong style={{ color: stats.attention ? "var(--accent-deep)" : undefined }}>
            {stats.attention}
          </strong>
          <span>Low</span>
        </article>
      </section>

      <section className="search-bar animate-rise animate-rise-delay-2">
        <div className="field">
          <label htmlFor="search" className="sr-only">
            Search
          </label>
          <input
            id="search"
            placeholder="Search materials or location"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="search-filter"
          aria-pressed={filter === "attention"}
          aria-label="Show items that need attention"
          onClick={() => setFilter((prev) => (prev === "all" ? "attention" : "all"))}
        >
          ▤
        </button>
        <select
          aria-label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="search-filter"
          style={{ width: "auto", minWidth: 48, padding: "0 10px" }}
        >
          <option value="all">All</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </section>

      {photoError ? <p className="form-error">{photoError}</p> : null}

      <section>
        <div className="section-head-row">
          <h2>Needs attention</h2>
          <button
            type="button"
            className="link-quiet"
            onClick={() => setFilter("attention")}
          >
            View all
          </button>
        </div>
        <div className="item-list">
          {needsAttention.length === 0 ? (
            <div className="panel empty">
              <h2>All healthy</h2>
              <p>Nothing is at or below the reorder point.</p>
            </div>
          ) : (
            needsAttention.slice(0, 4).map((item) => (
              <Link
                key={item.id}
                href={`/items/${item.id}`}
                className="panel attention-row"
              >
                {item.photo ? (
                  <span className="thumb-photo" aria-hidden>
                    <img src={item.photo} alt="" />
                  </span>
                ) : (
                  <span className="thumb-icon warn" aria-hidden>
                    <WarnEmblem size={20} />
                  </span>
                )}
                <span className="thumb-copy">
                  <strong>{item.name}</strong>
                  <span>
                    Low stock: {item.quantity} {item.unit} left
                  </span>
                </span>
                <StatusBadge item={item} />
              </Link>
            ))
          )}
        </div>
      </section>

      <div className="section-head-row">
        <h2>{filter === "attention" ? "Low / out items" : "All materials"}</h2>
        <Link href="/items/new" className="link-quiet">
          Add material
        </Link>
      </div>

      <section className="item-list">
        {visible.length === 0 ? (
          <div className="panel empty">
            <h2>No matching materials</h2>
            <p>Try another search, or add a new item to your stock list.</p>
            <Link href="/items/new" className="btn btn-primary">
              Add item
            </Link>
          </div>
        ) : (
          visible.map((item, index) => {
            const status = stockStatus(item);
            return (
              <article
                key={item.id}
                className={`panel item-row animate-rise${status !== "ok" ? " item-attention" : ""}`}
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <div className="item-main">
                  <div className="item-title-row">
                    <div className="item-heading">
                      <MaterialPhoto
                        item={item}
                        onSaved={applyItem}
                        onError={setPhotoError}
                      />
                      <Link href={`/items/${item.id}`} className="item-name">
                        {item.name}
                      </Link>
                    </div>
                    <StatusBadge item={item} />
                  </div>
                  <div className="item-meta">
                    <span>{categoryName(categories, item.category)}</span>
                    <span>{item.location || "No location"}</span>
                    <span>
                      Min {item.lowStockThreshold} {item.unit}
                    </span>
                  </div>
                </div>

                <div className="item-actions">
                  <div className="qty-label">
                    <span>{item.unit}</span>
                    <strong className="qty-value">{item.quantity}</strong>
                  </div>
                  <div className="row-actions">
                    <Link href={`/items/${item.id}`} className="btn btn-secondary edit-btn">
                      Edit
                    </Link>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}

function MaterialPhoto({
  item,
  onSaved,
  onError,
}: {
  item: InventoryItem;
  onSaved: (next: InventoryItem) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    onError("");
    try {
      const photo = await compressPhoto(file);
      const res = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save photo");
      onSaved(data);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save photo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`photo-box${item.photo ? " has-photo" : ""}`}
        disabled={busy}
        aria-label={item.photo ? `Change photo for ${item.name}` : `Add photo for ${item.name}`}
        onClick={() => inputRef.current?.click()}
      >
        {item.photo ? (
          <img src={item.photo} alt="" />
        ) : (
          <span aria-hidden>{busy ? "…" : "+"}</span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => void onPick(e)}
      />
    </>
  );
}
