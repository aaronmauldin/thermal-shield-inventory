"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  InventoryItem,
  LineItemTemplate,
  TemplateCalcMode,
} from "@/lib/types";

type Props = {
  initialTemplates: LineItemTemplate[];
  items: InventoryItem[];
};

type DraftMaterial = {
  itemId: string;
  calcMode: TemplateCalcMode;
  quantity: string;
  coverageSqft: string;
};

function blankRow(itemId: string): DraftMaterial {
  return {
    itemId,
    calcMode: "sqft_coverage",
    quantity: "1",
    coverageSqft: "49",
  };
}

export function TemplateManager({ initialTemplates, items }: Props) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [materials, setMaterials] = useState<DraftMaterial[]>([
    blankRow(items[0]?.id || ""),
  ]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name)),
    [items]
  );

  function resetForm() {
    setEditingId(null);
    setName("");
    setNotes("");
    setMaterials([blankRow(sortedItems[0]?.id || "")]);
  }

  function startEdit(template: LineItemTemplate) {
    setEditingId(template.id);
    setName(template.name);
    setNotes(template.notes);
    setMaterials(
      template.materials.map((m) => ({
        itemId: m.itemId,
        calcMode: m.calcMode === "sqft_coverage" ? "sqft_coverage" : "per_line",
        quantity: String(m.quantity || 1),
        coverageSqft: String(m.coverageSqft || 49),
      }))
    );
    setError("");
    setMessage("");
  }

  function updateMaterial(index: number, patch: Partial<DraftMaterial>) {
    setMaterials((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        name,
        notes,
        materials: materials.map((m) => ({
          itemId: m.itemId,
          calcMode: m.calcMode,
          quantity: Number(m.quantity),
          coverageSqft: Number(m.coverageSqft),
        })),
      };
      const res = await fetch(
        editingId ? `/api/templates/${editingId}` : "/api/templates",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save template");

      setTemplates((prev) => {
        if (editingId) {
          return prev.map((t) => (t.id === data.id ? data : t));
        }
        return [data, ...prev];
      });
      setMessage(
        editingId
          ? `Updated “${data.name}”.`
          : `Created template “${data.name}”.`
      );
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save template");
    } finally {
      setBusy(false);
    }
  }

  async function remove(template: LineItemTemplate) {
    if (!confirm(`Delete template “${template.name}”?`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/templates/${template.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete");
      setTemplates((prev) => prev.filter((t) => t.id !== template.id));
      if (editingId === template.id) resetForm();
      setMessage(`Deleted “${template.name}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  if (sortedItems.length === 0) {
    return (
      <div className="panel empty animate-rise">
        <h2>Add materials first</h2>
        <p>Templates pull quantities from your inventory list.</p>
        <Link href="/items/new" className="btn btn-primary">
          Add material
        </Link>
      </div>
    );
  }

  return (
    <div>
      <form className="panel form-panel animate-rise" onSubmit={save}>
        <p className="eyebrow">{editingId ? "Edit template" : "New template"}</p>
        <h2 className="section-title" style={{ marginBottom: 8 }}>
          Jobber line item → materials
        </h2>
        <p className="lede" style={{ marginBottom: 14 }}>
          Name must match the Jobber line item. For insulation, use{" "}
          <strong>From sqft</strong> and enter how many sqft one bag covers
          (bags = ceil(Jobber sqft ÷ coverage)).
        </p>

        <div className="form-grid">
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="template-name">Jobber line item name</label>
            <input
              id="template-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Attic Insulation R-38"
            />
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="template-notes">Notes</label>
            <input
              id="template-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        <div className="template-materials">
          <div className="section-head" style={{ marginBottom: 8 }}>
            <strong>Materials needed</strong>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                setMaterials((prev) => [
                  ...prev,
                  blankRow(sortedItems[0].id),
                ])
              }
            >
              Add material
            </button>
          </div>
          {materials.map((row, index) => (
            <div key={index} className="template-material-block">
              <div className="template-material-row">
                <div className="field" style={{ flex: 1, minWidth: 160 }}>
                  <label htmlFor={`mat-item-${index}`}>Material</label>
                  <select
                    id={`mat-item-${index}`}
                    value={row.itemId}
                    onChange={(e) =>
                      updateMaterial(index, { itemId: e.target.value })
                    }
                  >
                    {sortedItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.unit})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ minWidth: 150 }}>
                  <label htmlFor={`mat-mode-${index}`}>Calculate</label>
                  <select
                    id={`mat-mode-${index}`}
                    value={row.calcMode}
                    onChange={(e) =>
                      updateMaterial(index, {
                        calcMode: e.target.value as TemplateCalcMode,
                      })
                    }
                  >
                    <option value="sqft_coverage">From sqft</option>
                    <option value="per_line">Per line qty</option>
                  </select>
                </div>
                {row.calcMode === "sqft_coverage" ? (
                  <div className="field" style={{ width: 140 }}>
                    <label htmlFor={`mat-cover-${index}`}>
                      Sqft per {sortedItems.find((i) => i.id === row.itemId)?.unit || "unit"}
                    </label>
                    <input
                      id={`mat-cover-${index}`}
                      type="number"
                      min={0.01}
                      step="any"
                      required
                      value={row.coverageSqft}
                      onChange={(e) =>
                        updateMaterial(index, { coverageSqft: e.target.value })
                      }
                      placeholder="e.g. 49"
                    />
                  </div>
                ) : (
                  <div className="field" style={{ width: 110 }}>
                    <label htmlFor={`mat-qty-${index}`}>Qty / line</label>
                    <input
                      id={`mat-qty-${index}`}
                      type="number"
                      min={0.01}
                      step="any"
                      required
                      value={row.quantity}
                      onChange={(e) =>
                        updateMaterial(index, { quantity: e.target.value })
                      }
                    />
                  </div>
                )}
                {materials.length > 1 ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ alignSelf: "end" }}
                    onClick={() =>
                      setMaterials((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <p className="lede" style={{ margin: "0 0 8px" }}>
                {row.calcMode === "sqft_coverage"
                  ? `Example: 1,200 sqft ÷ ${row.coverageSqft || "?"} = ${
                      Number(row.coverageSqft) > 0
                        ? Math.ceil(1200 / Number(row.coverageSqft))
                        : "?"
                    } bags (rounded up)`
                  : `Example: Jobber qty 2 × ${row.quantity || "?"} = ${
                      Number(row.quantity) > 0
                        ? Math.round(2 * Number(row.quantity) * 10) / 10
                        : "?"
                    }`}
              </p>
            </div>
          ))}
        </div>

        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="form-success">{message}</p> : null}

        <div className="form-actions">
          {editingId ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={resetForm}
            >
              Cancel edit
            </button>
          ) : (
            <span />
          )}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving..." : editingId ? "Save changes" : "Create template"}
          </button>
        </div>
      </form>

      <section className="item-list" style={{ marginTop: 14 }}>
        {templates.length === 0 ? (
          <div className="panel empty animate-rise">
            <h2>No templates yet</h2>
            <p>
              Create one for each Jobber line item. Use From sqft for insulation
              bags.
            </p>
            <Link href="/estimates" className="btn btn-secondary">
              Upcoming material
            </Link>
          </div>
        ) : (
          templates.map((template, index) => (
            <article
              key={template.id}
              className="panel item-row animate-rise"
              style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
            >
              <div className="item-main" style={{ width: "100%" }}>
                <div className="item-title-row">
                  <h2 className="item-name" style={{ margin: 0 }}>
                    {template.name}
                  </h2>
                  <span className="badge badge-ok">
                    {template.materials.length} material
                    {template.materials.length === 1 ? "" : "s"}
                  </span>
                </div>
                {template.notes ? (
                  <p className="lede" style={{ marginTop: 6 }}>
                    {template.notes}
                  </p>
                ) : null}
                <ul className="job-materials">
                  {template.materials.map((m) => (
                    <li key={`${m.itemId}-${m.calcMode}`}>
                      {m.itemName}
                      {m.calcMode === "sqft_coverage" ? (
                        <span className="usage-unit">
                          {" "}
                          · 1 {m.unit} covers {m.coverageSqft} sqft
                        </span>
                      ) : (
                        <span className="usage-unit">
                          {" "}
                          · {m.quantity} {m.unit} per line qty
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="job-card-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => startEdit(template)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy}
                    onClick={() => remove(template)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
