"use client";

import { useMemo, useState } from "react";
import type { Category } from "@/lib/types";

type Props = {
  initialCategories: Category[];
  usageCounts: Record<string, number>;
};

export function CategoryManager({ initialCategories, usageCounts }: Props) {
  const [categories, setCategories] = useState(initialCategories);
  const [counts, setCounts] = useState(usageCounts);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const sorted = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add category");
      setCategories((prev) => [...prev, data]);
      setCounts((prev) => ({ ...prev, [data.id]: 0 }));
      setNewName("");
      setMessage(`Added “${data.name}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add category");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(category: Category) {
    setEditingId(category.id);
    setEditName(category.name);
    setError("");
    setMessage("");
  }

  async function saveEdit(id: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update category");
      setCategories((prev) => prev.map((c) => (c.id === id ? data : c)));
      setEditingId(null);
      setMessage(`Renamed to “${data.name}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update category");
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(category: Category) {
    const used = counts[category.id] || 0;
    const others = categories.filter((c) => c.id !== category.id);
    if (others.length === 0) {
      setError("Keep at least one category");
      return;
    }

    const confirmMsg =
      used > 0
        ? `Delete “${category.name}”? ${used} item(s) will move to “${others[0].name}”.`
        : `Delete “${category.name}”?`;
    if (!confirm(confirmMsg)) return;

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reassignTo: others[0].id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete category");

      setCategories((prev) => prev.filter((c) => c.id !== category.id));
      setCounts((prev) => {
        const next = { ...prev };
        const moved = next[category.id] || 0;
        delete next[category.id];
        next[data.reassignedTo] = (next[data.reassignedTo] || 0) + moved;
        return next;
      });
      setMessage(`Deleted “${category.name}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete category");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="category-manager">
      <form className="panel form-panel animate-rise" onSubmit={addCategory}>
        <div className="field">
          <label htmlFor="new-category">New category</label>
          <div className="inline-add">
            <input
              id="new-category"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Foam board, Tape, Hardware"
              required
            />
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Add
            </button>
          </div>
        </div>
      </form>

      <section className="item-list" style={{ marginTop: 14 }}>
        {sorted.map((category, index) => (
          <article
            key={category.id}
            className="panel item-row animate-rise"
            style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
          >
            <div className="item-main">
              {editingId === category.id ? (
                <div className="inline-add">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    aria-label="Category name"
                    autoFocus
                  />
                </div>
              ) : (
                <>
                  <div className="item-title-row">
                    <h2 className="item-name" style={{ margin: 0 }}>
                      {category.name}
                    </h2>
                  </div>
                  <div className="item-meta">
                    <span>
                      {counts[category.id] || 0} item
                      {(counts[category.id] || 0) === 1 ? "" : "s"}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="item-actions category-actions">
              {editingId === category.id ? (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => saveEdit(category.id)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => startEdit(category)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy || categories.length <= 1}
                    onClick={() => removeCategory(category)}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </section>

      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
