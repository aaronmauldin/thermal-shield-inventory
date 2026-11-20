"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { EmblemBadge, TruckEmblem } from "@/components/Emblems";
import type { Truck } from "@/lib/types";

export function TrucksManager() {
  const { user } = useAuth();
  const isCrew = user?.role === "crew";
  const [trucks, setTrucks] = useState<Truck[] | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [jobberNames, setJobberNames] = useState("");
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<
    Record<string, { name: string; notes: string; jobberNames: string }>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/trucks");
    if (!res.ok) throw new Error("Could not load trucks");
    setTrucks(await res.json());
  }

  useEffect(() => {
    load().catch((err) =>
      setError(err instanceof Error ? err.message : "Could not load trucks")
    );
  }, []);

  function startEditing() {
    const next: Record<
      string,
      { name: string; notes: string; jobberNames: string }
    > = {};
    for (const truck of trucks || []) {
      next[truck.id] = {
        name: truck.name,
        notes: truck.notes || "",
        jobberNames: (truck.jobberNames || []).join(", "),
      };
    }
    setDrafts(next);
    setEditing(true);
    setError("");
    setMessage("");
  }

  function stopEditing() {
    setEditing(false);
    setDrafts({});
    setName("");
    setNotes("");
    setJobberNames("");
    setError("");
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/trucks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, notes, jobberNames }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add truck");
      setTrucks((prev) =>
        [...(prev || []), data].sort((a, b) => a.name.localeCompare(b.name))
      );
      if (editing) {
        setDrafts((prev) => ({
          ...prev,
          [data.id]: {
            name: data.name,
            notes: data.notes || "",
            jobberNames: (data.jobberNames || []).join(", "),
          },
        }));
      }
      setName("");
      setNotes("");
      setJobberNames("");
      setMessage(`Added ${data.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add truck");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveTruck(truck: Truck) {
    const draft = drafts[truck.id];
    if (!draft?.name.trim()) {
      setError("Truck name is required");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/trucks/${truck.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          notes: draft.notes,
          jobberNames: draft.jobberNames,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save truck");
      setTrucks((prev) =>
        (prev || [])
          .map((t) => (t.id === data.id ? data : t))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setMessage(`Saved ${data.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save truck");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(truck: Truck) {
    if (!confirm(`Delete ${truck.name}?`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/trucks/${truck.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete truck");
      setTrucks((prev) => (prev || []).filter((t) => t.id !== truck.id));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[truck.id];
        return next;
      });
      setMessage(`Deleted ${truck.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete truck");
    } finally {
      setBusy(false);
    }
  }

  if (!trucks && !error) {
    return (
      <div className="panel empty animate-rise">
        <h2>Loading trucks...</h2>
      </div>
    );
  }

  return (
    <div className="trucks-page">
      <div className="page-title-block">
        <div>
          <h1 className="page-title page-title-with-emblem">
            <EmblemBadge tone="blue">
              <TruckEmblem size={24} />
            </EmblemBadge>
            Trucks
          </h1>
          <p className="page-lead">
            {isCrew
              ? "Your assigned truck — jobs, stock, and bag tally."
              : editing
              ? "Edit names or delete trucks, then tap Done."
              : "Select a truck to open jobs, stock, and bag tally."}
          </p>
        </div>
        {isCrew ? null : (
          <button
            type="button"
            className={`btn ${editing ? "btn-primary" : "btn-secondary"}`}
            onClick={() => (editing ? stopEditing() : startEditing())}
          >
            {editing ? "Done" : "Edit"}
          </button>
        )}
      </div>

      {editing && !isCrew ? (
        <form className="panel form-panel animate-rise" onSubmit={onAdd}>
          <p className="eyebrow" style={{ marginBottom: 12 }}>
            Add a truck
          </p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="truck-name">Truck name</label>
              <input
                id="truck-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Truck A, Van 2..."
              />
            </div>
            <div className="field">
              <label htmlFor="truck-notes">Notes</label>
              <input
                id="truck-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="field">
              <label htmlFor="truck-jobber">Jobber Team names</label>
              <input
                id="truck-jobber"
                value={jobberNames}
                onChange={(e) => setJobberNames(e.target.value)}
                placeholder="Zack's Crew"
              />
              <p className="item-meta" style={{ marginTop: 6 }}>
                Jobber usually sends the people on that team, not the team title. You can
                also list those names here, comma-separated.
              </p>
            </div>
          </div>
          <div className="form-actions">
            <span />
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Add truck
            </button>
          </div>
        </form>
      ) : null}

      <section className="item-list" style={{ marginTop: 14 }}>
        {(trucks || []).length === 0 ? (
          <div className="panel empty">
            <h2>No trucks yet</h2>
            <p>
              {isCrew
                ? "Ask an admin to assign you a truck."
                : "Add a truck, then open it to log jobs, materials, and bag tally."}
            </p>
          </div>
        ) : editing ? (
          (trucks || []).map((truck) => (
            <article key={truck.id} className="panel form-panel animate-rise">
              <div className="form-grid">
                <div className="field">
                  <label htmlFor={`edit-name-${truck.id}`}>Name</label>
                  <input
                    id={`edit-name-${truck.id}`}
                    value={drafts[truck.id]?.name || ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [truck.id]: {
                          name: e.target.value,
                          notes: prev[truck.id]?.notes || "",
                          jobberNames: prev[truck.id]?.jobberNames || "",
                        },
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor={`edit-notes-${truck.id}`}>Notes</label>
                  <input
                    id={`edit-notes-${truck.id}`}
                    value={drafts[truck.id]?.notes || ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [truck.id]: {
                          name: prev[truck.id]?.name || truck.name,
                          notes: e.target.value,
                          jobberNames: prev[truck.id]?.jobberNames || "",
                        },
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor={`edit-jobber-${truck.id}`}>Jobber Team names</label>
                  <input
                    id={`edit-jobber-${truck.id}`}
                    value={drafts[truck.id]?.jobberNames || ""}
                    placeholder="Zack's Crew"
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [truck.id]: {
                          name: prev[truck.id]?.name || truck.name,
                          notes: prev[truck.id]?.notes || "",
                          jobberNames: e.target.value,
                        },
                      }))
                    }
                  />
                </div>
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => onDelete(truck)}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => onSaveTruck(truck)}
                >
                  Save
                </button>
              </div>
            </article>
          ))
        ) : (
          (trucks || []).map((truck) => (
            <Link
              key={truck.id}
              href={`/trucks/${truck.id}`}
              className="panel item-row animate-rise more-link truck-list-link"
            >
              <EmblemBadge tone="blue">
                <TruckEmblem size={22} />
              </EmblemBadge>
              <div className="item-main">
                <div className="item-title-row">
                  <strong className="item-name">{truck.name}</strong>
                </div>
                <div className="item-meta">
                  <span>
                    {(truck.jobberNames || []).length
                      ? `Jobber: ${(truck.jobberNames || []).join(", ")}`
                      : truck.notes || "Open for jobs, materials & bag tally"}
                  </span>
                </div>
              </div>
            </Link>
          ))
        )}
      </section>

      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
