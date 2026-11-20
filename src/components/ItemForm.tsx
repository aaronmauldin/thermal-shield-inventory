"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Category, InventoryItem } from "@/lib/types";

type Props = {
  item?: InventoryItem;
  categories?: Category[];
};

export function ItemForm({ item, categories: initialCategories }: Props) {
  const router = useRouter();
  const editing = Boolean(item);
  const [categories, setCategories] = useState<Category[]>(initialCategories ?? []);
  const [loadingCategories, setLoadingCategories] = useState(!initialCategories);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: item?.name ?? "",
    category: item?.category ?? initialCategories?.[0]?.id ?? "",
    quantity: String(item?.quantity ?? 0),
    unit: item?.unit ?? "units",
    lowStockThreshold: String(item?.lowStockThreshold ?? 5),
    location: item?.location ?? "",
    notes: item?.notes ?? "",
  });

  useEffect(() => {
    if (initialCategories) {
      setCategories(initialCategories);
      setLoadingCategories(false);
      return;
    }

    let cancelled = false;
    setLoadingCategories(true);
    fetch("/api/categories")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Category[]) => {
        if (cancelled) return;
        setCategories(data);
        setForm((prev) => ({
          ...prev,
          category: prev.category || data[0]?.id || "",
        }));
      })
      .catch(() => {
        if (!cancelled) setError("Could not load categories");
      })
      .finally(() => {
        if (!cancelled) setLoadingCategories(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialCategories]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        category: form.category,
        quantity: Number(form.quantity),
        unit: form.unit,
        unitCost: item?.unitCost ?? 0,
        lowStockThreshold: Number(form.lowStockThreshold),
        location: form.location,
        notes: form.notes,
      };

      const res = await fetch(editing ? `/api/items/${item!.id}` : "/api/items", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not save item");
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save item");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!item || !confirm(`Delete ${item.name}?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/items/${item.id}`, { method: "DELETE" });
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!loadingCategories && categories.length === 0) {
    return (
      <div className="panel empty animate-rise">
        <h2>Add a category first</h2>
        <p>Create at least one category before adding materials.</p>
        <Link href="/categories" className="btn btn-primary">
          Manage categories
        </Link>
      </div>
    );
  }

  return (
    <form className="panel form-panel animate-rise" onSubmit={onSubmit}>
      <div className="form-grid">
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="name">Item name</label>
          <input
            id="name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Fireblock Foam Sealant"
          />
        </div>

        <div className="field">
          <label htmlFor="category">Category</label>
          <select
            id="category"
            required
            disabled={loadingCategories}
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {loadingCategories ? (
              <option value="">Loading categories...</option>
            ) : (
              categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
          <Link href="/categories" className="field-link">
            Manage categories
          </Link>
        </div>

        <div className="field">
          <label htmlFor="location">Location</label>
          <input
            id="location"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="Truck A / Bay 2"
          />
        </div>

        <div className="field">
          <label htmlFor="quantity">Quantity on hand</label>
          <input
            id="quantity"
            type="number"
            min={0}
            required
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
        </div>

        <div className="field">
          <label htmlFor="unit">Unit</label>
          <input
            id="unit"
            required
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            placeholder="tubes, bags, cans..."
          />
        </div>

        <div className="field">
          <label htmlFor="threshold">Low-stock alert at</label>
          <input
            id="threshold"
            type="number"
            min={0}
            required
            value={form.lowStockThreshold}
            onChange={(e) =>
              setForm({ ...form, lowStockThreshold: e.target.value })
            }
          />
        </div>

        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Optional job notes, SKU, supplier..."
          />
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="form-actions">
        {editing ? (
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={onDelete}
          >
            Delete
          </button>
        ) : (
          <span />
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => router.back()}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || loadingCategories || !form.category}
          >
            {busy ? "Saving..." : editing ? "Save changes" : "Add to inventory"}
          </button>
        </div>
      </div>
    </form>
  );
}
