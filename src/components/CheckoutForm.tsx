"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  categoryName,
  type Category,
  type InventoryItem,
  type Truck,
} from "@/lib/types";
import {
  showLocalStockNotification,
  stockAlertCopy,
} from "@/lib/notify-client";
import { useAuth } from "./AuthProvider";
import { TruckEmblem } from "@/components/Emblems";

const NAME_KEY = "tsi-inv-employee-name";
const TRUCK_KEY = "tsi-inv-truck-id";

export function CheckoutForm() {
  const router = useRouter();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const preselectedId = searchParams.get("item") || "";

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [truckId, setTruckId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<"all" | string>("all");
  const [selected, setSelected] = useState<Record<string, number>>({});

  useEffect(() => {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved) setEmployeeName(saved);
    else if (user?.name) setEmployeeName(user.name);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/items").then((res) => res.json()),
      fetch("/api/categories").then((res) => res.json()),
      fetch("/api/trucks").then((res) => res.json()),
    ])
      .then(([nextItems, nextCategories, nextTrucks]) => {
        if (cancelled) return;
        setItems(nextItems);
        setCategories(nextCategories);
        setTrucks(nextTrucks);
        const savedTruck = localStorage.getItem(TRUCK_KEY) || "";
        const assigned = user?.truckIds?.length
          ? user.truckIds
          : user?.truckId
            ? [user.truckId]
            : [];
        const preferred =
          (nextTrucks as Truck[]).find((t) => t.id === savedTruck && assigned.includes(t.id))?.id ||
          (nextTrucks as Truck[]).find((t) => assigned.includes(t.id))?.id ||
          (nextTrucks as Truck[]).find((t) => t.id === savedTruck)?.id ||
          nextTrucks[0]?.id ||
          "";
        setTruckId(preferred);
        if (preselectedId) {
          const match = (nextItems as InventoryItem[]).find(
            (item) => item.id === preselectedId && item.quantity > 0
          );
          if (match) {
            setSelected({ [match.id]: 1 });
          }
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load materials");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    }, [preselectedId, user?.truckId, user?.truckIds]);

  const availableItems = useMemo(
    () => items.filter((item) => item.quantity > 0),
    [items]
  );

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return availableItems.filter((item) => {
      const matchesCategory = categoryId === "all" || item.category === categoryId;
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.location.toLowerCase().includes(q) ||
        categoryName(categories, item.category).toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [availableItems, query, categories, categoryId]);

  const selectedLines = useMemo(
    () =>
      Object.entries(selected)
        .map(([itemId, quantity]) => ({ itemId, quantity }))
        .filter((line) => line.quantity > 0),
    [selected]
  );

  const selectedCount = selectedLines.length;

  function toggleItem(item: InventoryItem) {
    setSelected((prev) => {
      if (prev[item.id]) {
        const next = { ...prev };
        delete next[item.id];
        return next;
      }
      return { ...prev, [item.id]: 1 };
    });
    setSuccess("");
    setError("");
  }

  function setQty(item: InventoryItem, raw: string) {
    const qty = Math.floor(Number(raw));
    if (!Number.isFinite(qty) || qty < 1) {
      setSelected((prev) => ({ ...prev, [item.id]: 1 }));
      return;
    }
    setSelected((prev) => ({
      ...prev,
      [item.id]: Math.min(qty, item.quantity),
    }));
  }

  function bumpQty(item: InventoryItem, delta: number) {
    setSelected((prev) => {
      const current = prev[item.id] || 1;
      const next = Math.min(item.quantity, Math.max(1, current + delta));
      return { ...prev, [item.id]: next };
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedLines.length === 0) {
      setError("Select at least one material");
      return;
    }
    if (trucks.length > 0 && !truckId) {
      setError("Select a truck");
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/checkouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeName,
          truckId: truckId || null,
          lines: selectedLines,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");

      localStorage.setItem(NAME_KEY, employeeName.trim());
      if (truckId) localStorage.setItem(TRUCK_KEY, truckId);

      const names = (data.checkouts as { itemName: string; quantity: number; unit: string }[])
        .map((c) => `${c.quantity} ${c.unit} ${c.itemName}`)
        .join(", ");
      const truckLabel =
        trucks.find((t) => t.id === truckId)?.name || "truck";
      setSuccess(
        `${employeeName.trim()} moved to ${truckLabel}: ${names}.`
      );

      const updatedMap = new Map(
        (data.items as InventoryItem[]).map((item) => [item.id, item])
      );
      setItems((prev) =>
        prev.map((item) => updatedMap.get(item.id) || item)
      );
      setSelected({});

      for (const item of data.items as InventoryItem[]) {
        const notice = stockAlertCopy(item);
        if (notice) void showLocalStockNotification(notice);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="panel empty animate-rise">
        <h2>Loading materials...</h2>
        <p>Getting what&apos;s on hand.</p>
      </div>
    );
  }

  if (availableItems.length === 0) {
    return (
      <div className="panel empty animate-rise">
        <h2>Nothing to check out</h2>
        <p>All materials are currently at zero stock.</p>
        <Link href="/" className="btn btn-primary">
          Back to stock
        </Link>
      </div>
    );
  }

  const checkoutTruck = trucks.find((truck) => truck.id === truckId);

  return (
    <form className="checkout-multi animate-rise" onSubmit={onSubmit}>
      <section className="panel checkout-identity">
        <p className="eyebrow">Who and where</p>
        <div className="checkout-who">
          <div className="field">
            <label htmlFor="employeeName">Your name</label>
            <div className="input-with-icon">
              <span className="input-icon" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
                  <path
                    d="M5 19.2c.8-3.2 3.4-5.2 7-5.2s6.2 2 7 5.2"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <input
                id="employeeName"
                required
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                placeholder="First and last name"
                autoComplete="name"
              />
            </div>
          </div>
          {trucks.length > 0 ? (
            <div className="field">
              <label htmlFor="truckId">Truck</label>
              <div className="input-with-icon">
                <span className="input-icon" aria-hidden>
                  <TruckEmblem size={18} />
                </span>
                <select
                  id="truckId"
                  required
                  value={truckId}
                  onChange={(e) => setTruckId(e.target.value)}
                  disabled={user?.role === "crew"}
                >
                  {trucks.map((truck) => (
                    <option key={truck.id} value={truck.id}>
                      {truck.name}
                    </option>
                  ))}
                </select>
              </div>
              {user?.role === "crew" ? null : (
                <Link href="/trucks" className="field-link">
                  Manage trucks
                </Link>
              )}
            </div>
          ) : (
            <p className="hint">
              No trucks yet. <Link href="/trucks">Add a truck</Link> so checkout
              can track which vehicle took materials.
            </p>
          )}
        </div>
      </section>

      <section className="panel form-panel" style={{ marginTop: 14 }}>
        <div className="field">
          <label htmlFor="checkout-search">Find materials</label>
          <input
            id="checkout-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search materials..."
          />
        </div>
        <div className="chip-row" role="group" aria-label="Category" style={{ marginTop: 12 }}>
          <button
            type="button"
            className={`chip${categoryId === "all" ? " chip-active" : ""}`}
            onClick={() => setCategoryId("all")}
          >
            All
          </button>
          {categories.slice(0, 6).map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`chip${categoryId === cat.id ? " chip-active" : ""}`}
              onClick={() => setCategoryId(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </section>

      <section className="item-list" style={{ marginTop: 14 }}>
        {visibleItems.length === 0 ? (
          <div className="panel empty">
            <h2>No matches</h2>
            <p>Try another search.</p>
          </div>
        ) : (
          visibleItems.map((item) => {
            const isSelected = Boolean(selected[item.id]);
            const qty = selected[item.id] || 1;
            return (
              <article
                key={item.id}
                className={`panel checkout-row${isSelected ? " checkout-row-selected" : ""}`}
              >
                <button
                  type="button"
                  className="checkout-select"
                  onClick={() => toggleItem(item)}
                  aria-pressed={isSelected}
                >
                  <span className={`check-box${isSelected ? " checked" : ""}`} aria-hidden>
                    {isSelected ? "✓" : ""}
                  </span>
                  <span className="checkout-select-copy">
                    <strong>{item.name}</strong>
                    <span>
                      {categoryName(categories, item.category)}
                      {item.location ? ` · ${item.location}` : ""}
                      {` · ${item.quantity} ${item.unit} left`}
                    </span>
                  </span>
                </button>

                {isSelected ? (
                  <div className="checkout-qty">
                    <label htmlFor={`qty-${item.id}`}>Qty</label>
                    <div className="stepper">
                      <button
                        type="button"
                        aria-label={`Decrease ${item.name}`}
                        onClick={() => bumpQty(item, -1)}
                      >
                        −
                      </button>
                      <input
                        id={`qty-${item.id}`}
                        className="qty-input"
                        type="number"
                        min={1}
                        max={item.quantity}
                        value={qty}
                        onChange={(e) => setQty(item, e.target.value)}
                      />
                      <button
                        type="button"
                        aria-label={`Increase ${item.name}`}
                        onClick={() => bumpQty(item, 1)}
                        disabled={qty >= item.quantity}
                      >
                        +
                      </button>
                    </div>
                    <span className="after-mini">
                      Left {Math.max(0, item.quantity - qty)} {item.unit}
                    </span>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </section>

      {success ? <p className="form-success">{success}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <div className="checkout-bar panel">
        <div>
          <strong>
            {selectedCount} item{selectedCount === 1 ? "" : "s"} selected
          </strong>
          <span>
            {selectedLines.reduce((sum, line) => sum + line.quantity, 0)} total
            units
          </span>
        </div>
        <div className="checkout-bar-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => router.push("/history")}
          >
            History
          </button>
          <button
            type="submit"
            className="btn btn-accent"
            disabled={busy || selectedCount === 0}
          >
            {busy
              ? "Checking out..."
              : selectedCount === 0
                ? "Select materials"
                : `Check Out to ${checkoutTruck?.name || "Truck"}`}
          </button>
        </div>
      </div>
    </form>
  );
}
