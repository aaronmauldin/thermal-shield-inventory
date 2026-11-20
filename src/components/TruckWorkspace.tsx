"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmblemBadge, InventoryEmblem, TruckEmblem } from "@/components/Emblems";
import type { JobRecord, Truck, TruckStockItem } from "@/lib/types";
import {
  compareJobsBySchedule,
  formatJobDateLabel,
} from "@/lib/jobSort";

const NAME_KEY = "tsi-inv-employee-name";

type Props = { truckId: string };

function isBagItem(item: { unit: string; itemName: string; itemId?: string; quantity?: number }) {
  return /bag/i.test(item.unit) || /bag/i.test(item.itemName) || /insul/i.test(item.itemName);
}

function roundQty(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function isQtyDraft(raw: string) {
  return raw === "" || /^\d*\.?\d*$/.test(raw);
}

function qtyFromDraft(raw: string) {
  if (!raw || raw === ".") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function finishQty(raw: string, max?: number) {
  const next = roundQty(qtyFromDraft(raw));
  if (max === undefined) return Math.max(0, next);
  return Math.max(0, Math.min(max, next));
}

function JobDateText({
  iso,
  suffix = "",
}: {
  iso: string | null | undefined;
  suffix?: string;
}) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    setLabel(formatJobDateLabel(iso));
  }, [iso]);
  if (!label) return null;
  return (
    <>
      {label}
      {suffix}
    </>
  );
}

function jobHeadline(name: string) {
  const match = String(name || "").match(/#\s*(\d+)/);
  if (!match) return { number: null as string | null, title: name };
  return {
    number: `#${match[1]}`,
    title: name.replace(/#\s*\d+\s*/, "").trim() || name,
  };
}

export function TruckWorkspace({ truckId }: Props) {
  const [truck, setTruck] = useState<Truck | null>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [stock, setStock] = useState<TruckStockItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [jobsPanelOpen, setJobsPanelOpen] = useState(false);
  const [stockPanelOpen, setStockPanelOpen] = useState(false);
  const [jobQuery, setJobQuery] = useState("");
  const [showNewJob, setShowNewJob] = useState(false);
  const [jobName, setJobName] = useState("");
  const [jobLocation, setJobLocation] = useState("");
  const [jobNotes, setJobNotes] = useState("");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [bagItemId, setBagItemId] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [editingStock, setEditingStock] = useState(false);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [returnDest, setReturnDest] = useState("warehouse");
  const [otherTrucks, setOtherTrucks] = useState<{ id: string; name: string }[]>([]);
  const [editingQty, setEditingQty] = useState<Record<string, number>>({});
  const [moveToJob, setMoveToJob] = useState<Record<string, string>>({});
  const [editingJob, setEditingJob] = useState(false);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [openUsedId, setOpenUsedId] = useState<string | null>(null);

  async function load(keepJobId?: string) {
    const res = await fetch(`/api/trucks/${truckId}`);
    if (!res.ok) throw new Error("Truck not found");
    const data = await res.json();
    setTruck(data.truck);
    setJobs(data.jobs);
    setOtherTrucks(Array.isArray(data.otherTrucks) ? data.otherTrucks : []);
    const nextStock = data.stock || data.truck.stock || [];
    setStock(nextStock);
    const preferred = keepJobId || selectedJobId || data.jobs[0]?.id || "";
    if (preferred) setSelectedJobId(preferred);
    const bags = nextStock.filter(isBagItem);
    if (bags.length && !bags.some((b: TruckStockItem) => b.itemId === bagItemId)) {
      setBagItemId(bags[0].itemId);
    }
    setReturnQty((prev) => {
      const next: Record<string, number> = {};
      for (const item of nextStock) {
        next[item.itemId] = Math.min(prev[item.itemId] || 0, item.quantity);
      }
      return next;
    });
  }

  useEffect(() => {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved) setEmployeeName(saved);
    load()
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load truck")
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truckId]);

  const selectedJob = jobs.find((j) => j.id === selectedJobId) || null;
  const otherJobs = jobs.filter((job) => job.id !== selectedJobId);
  const bagStock = useMemo(() => stock.filter(isBagItem), [stock]);
  const otherStock = useMemo(() => stock.filter((item) => !isBagItem(item)), [stock]);
  const usedOther = useMemo(
    () => (selectedJob?.materials || []).filter((item) => !isBagItem(item)),
    [selectedJob]
  );
  const visibleJobs = useMemo(() => {
    const q = jobQuery.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((job) => {
      const hay = [
        job.name,
        job.location,
        job.notes,
        ...(job.materials || []).map((m) => m.itemName),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [jobs, jobQuery]);

  useEffect(() => {
    const next: Record<string, number> = {};
    for (const material of selectedJob?.materials || []) {
      next[material.itemId] = material.quantity;
    }
    setEditingQty(next);
  }, [selectedJob]);

  useEffect(() => {
    if (!selectedJob) return;
    setEditName(selectedJob.name);
    setEditLocation(selectedJob.location || "");
    setEditingJob(false);
    // Only reset the form when switching jobs, not when materials update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId]);

  function applyJobResult(data: {
    job?: JobRecord;
    otherJob?: JobRecord;
    truck?: Truck;
  }) {
    if (data.job) {
      setJobs((prev) => {
        let next = prev.map((job) => (job.id === data.job?.id ? data.job : job));
        if (data.otherJob) {
          next = next.map((job) =>
            job.id === data.otherJob?.id ? data.otherJob : job
          );
        }
        return next;
      });
    }
    if (data.truck) {
      setTruck(data.truck);
      setStock((data.truck.stock || []).filter((item: TruckStockItem) => item.quantity > 0));
    }
  }

  async function saveJobDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedJob) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          location: editLocation,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update job");
      const job = data.job || data;
      setJobs((prev) => prev.map((entry) => (entry.id === job.id ? job : entry)));
      setEditingJob(false);
      setMessage("Updated job name and address.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update job");
    } finally {
      setBusy(false);
    }
  }

  async function createJob(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: jobName,
          location: jobLocation,
          notes: jobNotes,
          truckId,
          materials: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create job");
      setJobs((prev) => [data, ...prev].sort(compareJobsBySchedule));
      setSelectedJobId(data.id);
      setShowNewJob(false);
      setJobsPanelOpen(false);
      setJobName("");
      setJobLocation("");
      setJobNotes("");
      setSelected({});
      setMessage(`Job “${data.name}” created.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create job");
    } finally {
      setBusy(false);
    }
  }

  async function useOnJob() {
    if (!selectedJob) return;
    const lines = Object.entries(selected)
      .map(([itemId, quantity]) => {
        const onTruck =
          otherStock.find((item) => item.itemId === itemId)?.quantity ?? 0;
        const raw =
          qtyDraft[itemId] !== undefined ? qtyDraft[itemId] : String(quantity);
        return { itemId, quantity: finishQty(raw, onTruck) };
      })
      .filter((line) => line.quantity > 0);

    if (lines.length === 0) {
      setError("Select materials on this truck to use on the job");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useFromTruck: true, lines }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not use materials");
      applyJobResult(data);
      setSelected({});
      setQtyDraft({});
      setMessage("Used on job — removed from truck stock.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not use materials");
    } finally {
      setBusy(false);
    }
  }

  async function addBags(count: number) {
    if (!selectedJob) {
      setError("Select or create a job first");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addBags: true,
          bags: count,
          employeeName,
          itemId: bagItemId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add bags");
      if (employeeName.trim()) {
        localStorage.setItem(NAME_KEY, employeeName.trim());
      }
      applyJobResult(data);
      setMessage(`+${count} bag${count === 1 ? "" : "s"} on job — taken off truck.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add bags");
    } finally {
      setBusy(false);
    }
  }

  async function saveUsedQty(itemId: string, quantityOverride?: number) {
    if (!selectedJob) return;
    const quantity = Math.max(
      0,
      roundQty(
        Number(
          quantityOverride !== undefined
            ? quantityOverride
            : editingQty[itemId] ?? 0
        )
      )
    );
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correctMaterial: true, itemId, quantity }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update used material");
      applyJobResult(data);
      setMessage(
        quantity === 0
          ? "Removed from this job and put back on the truck."
          : "Updated used quantity. Extra went back on the truck, or extra came off the truck."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update used material");
    } finally {
      setBusy(false);
    }
  }

  async function moveUsed(itemId: string) {
    if (!selectedJob) return;
    const toJobId = moveToJob[itemId];
    if (!toJobId) {
      setError("Pick the job it should be on");
      return;
    }
    const quantity = Math.max(0, roundQty(Number(editingQty[itemId] ?? 0)));
    if (quantity <= 0) {
      setError("Type how much to move");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moveMaterial: true,
          itemId,
          quantity,
          toJobId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not move material");
      applyJobResult(data);
      setMoveToJob((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      const dest = data.otherJob?.name || "the other job";
      setMessage(`Moved to “${dest}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move material");
    } finally {
      setBusy(false);
    }
  }

  async function syncFromJobber() {
    setBusy(true);
    setError("");
    setMessage("Pulling jobs from Jobber…");
    try {
      const res = await fetch("/api/jobber/sync-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not sync Jobber jobs");
      await load(selectedJobId);
      const unmatched = (data.unmatchedNames || []) as string[];
      const scanned = Number(data.scanned) || 0;
      const created = Number(data.created) || 0;
      const updated = Number(data.updated) || 0;
      const kept = Number(data.kept) || 0;
      const noCrew = Number(data.noCrewCount) || 0;
      const active = Number(data.activeCount) || scanned;
      const noTruck = (data.matchedNoTruckNames || []) as string[];
      const sample = (data.assignedSample || []) as string[];
      const usersHidden = Boolean(data.usersHidden) && sample.length === 0;
      if (usersHidden) {
        setError(
          "Jobber is still hiding Team names, so this connection does not have Users access yet. After Users read is saved, open Upcoming material, tap Disconnect, then Connect Jobber. On Jobber’s Allow Access screen you must see Users. If that screen is skipped, remove this app under Jobber → App Marketplace / connected apps, then Connect again as a Jobber admin."
        );
      }
      if (created === 0 && updated === 0 && kept === 0) {
        if (usersHidden) {
          setMessage(
            "Jobs were found, but Jobber still hid every Team name. Turning Users read on is not enough until you Disconnect and Connect again."
          );
        } else if (noTruck.length) {
          setMessage(
            `Jobber Team names matched these logins, but they have no truck in Settings → Logins: ${noTruck.join(", ")}`
          );
        } else if (noCrew && noCrew >= active) {
          setMessage(
            `Found ${scanned} scheduled Jobber job${scanned === 1 ? "" : "s"}, but none have people in the Jobber Team column. Put crew on Team for each calendar visit.`
          );
        } else if (unmatched.length === 0) {
          setMessage(
            scanned
              ? `Found ${scanned} scheduled Jobber job${scanned === 1 ? "" : "s"} in the next few weeks, but none matched a login with a truck. Team names in Jobber have to match Settings → Logins.`
              : "Sync finished, but Jobber did not return any scheduled visits. Jobs have to be on the Jobber calendar (not just created)."
          );
        } else {
          setMessage("Sync finished. Matching names are listed below.");
        }
      } else {
        const parts = [];
        if (created) parts.push(`${created} new`);
        if (kept) parts.push(`${kept} already on a truck`);
        setMessage(
          parts.length
            ? `Jobber sync finished (${parts.join(", ")}). Already synced jobs were left alone.`
            : "Jobber sync finished. Already synced jobs were left alone."
        );
      }
      if (unmatched.length) {
        setError(
          `Jobber Team names with no matching login: ${unmatched.join(", ")}`
        );
      } else if (
        sample.length &&
        created === 0 &&
        updated === 0 &&
        kept === 0 &&
        noTruck.length === 0
      ) {
        setError(`Jobber Team names seen: ${sample.join(", ")}`);
      }
    } catch (err) {
      setMessage("");
      setError(err instanceof Error ? err.message : "Could not sync Jobber jobs");
    } finally {
      setBusy(false);
    }
  }

  async function removeBag() {
    if (!selectedJob) return;
    const bagLine =
      (selectedJob.materials || []).find((item) => item.itemId === bagItemId) ||
      (selectedJob.materials || []).find((item) => isBagItem({
        itemId: item.itemId,
        itemName: item.itemName,
        unit: item.unit,
        quantity: item.quantity,
      }));
    if (!bagLine || bagLine.quantity < 1) {
      setError("No bags on this job to take off");
      return;
    }
    setEditingQty((prev) => ({ ...prev, [bagLine.itemId]: bagLine.quantity - 1 }));
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correctMaterial: true,
          itemId: bagLine.itemId,
          quantity: bagLine.quantity - 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove bag");
      applyJobResult(data);
      setMessage("Took 1 bag off this job and put it back on the truck.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove bag");
    } finally {
      setBusy(false);
    }
  }

  function openReturnSheet() {
    setEditingStock(true);
    setReturnQty({});
    setReturnDest("warehouse");
    setError("");
  }

  async function sendSelected() {
    const lines = Object.entries(returnQty)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, quantity]) => ({ itemId, quantity }));
    if (lines.length === 0) {
      setError("Select materials to send");
      return;
    }
    const moving = returnDest !== "warehouse";
    if (moving && !returnDest) {
      setError("Pick a truck to move to");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/trucks/${truckId}/stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeName,
          lines,
          action: moving ? "move" : "return",
          toTruckId: moving ? returnDest : "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send material");
      const nextStock = (data.truck.stock || []).filter(
        (s: TruckStockItem) => s.quantity > 0
      );
      setTruck(data.truck);
      setStock(nextStock);
      setReturnQty({});
      if (nextStock.length === 0) setEditingStock(false);
      const movedRows = (data.returns || data.transfers || []) as {
        itemName: string;
        quantity: number;
        unit: string;
      }[];
      const names = movedRows
        .map((row) => `${row.quantity} ${row.unit} ${row.itemName}`)
        .join(", ");
      const destName = otherTrucks.find((t) => t.id === returnDest)?.name;
      setMessage(
        moving
          ? `Moved to ${destName || "truck"}: ${names}.`
          : `Returned to warehouse: ${names}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send material");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="panel empty">
        <h2>Opening truck...</h2>
      </div>
    );
  }

  if (!truck) {
    return (
      <div className="panel empty animate-rise">
        <h2>Truck not found</h2>
        <Link href="/trucks" className="btn btn-primary">
          Back to trucks
        </Link>
      </div>
    );
  }

  const headline = selectedJob ? jobHeadline(selectedJob.name) : null;

  return (
    <div className="truck-workspace">
      <div className="truck-back">
        <Link href="/trucks" className="field-link">
          ← All trucks
        </Link>
      </div>

      <div className="truck-desktop">
      <section className="panel form-panel truck-hero animate-rise">
        <div className="truck-hero-top">
          <div>
            <h1 className="page-title page-title-with-emblem" style={{ marginBottom: 4 }}>
              <EmblemBadge tone="blue">
                <TruckEmblem size={24} />
              </EmblemBadge>
              {truck.name}
            </h1>
            <p className="page-lead" style={{ marginBottom: 0 }}>
              Open for jobs, materials &amp; bag tally.
            </p>
          </div>
          {selectedJob ? <span className="badge badge-ok">Active</span> : null}
        </div>

        <button
          type="button"
          className="stat-pill truck-materials-box"
          onClick={() => setStockPanelOpen(true)}
          aria-label="View materials on this truck"
        >
          <span className="stat-pill-icon warn" aria-hidden>
            <InventoryEmblem size={20} />
          </span>
          <span className="truck-materials-label">Materials</span>
        </button>

        <div className="truck-actions">
          <Link href="/checkout" className="btn btn-accent">
            + Add Material
          </Link>
          {stock.length > 0 ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={openReturnSheet}
            >
              ↩ Return Material
            </button>
          ) : (
            <span />
          )}
        </div>
      </section>

      <section className="panel form-panel job-card animate-rise">
        <div className="section-head" style={{ marginBottom: 10 }}>
          <p className="eyebrow" style={{ margin: 0 }}>
            Active Job
          </p>
          <div className="job-card-links">
            {selectedJob ? (
              <button
                type="button"
                className="link-quiet"
                onClick={() => {
                  setEditName(selectedJob.name);
                  setEditLocation(selectedJob.location || "");
                  setEditingJob((open) => !open);
                  setError("");
                }}
              >
                {editingJob ? "Cancel" : "Edit"}
              </button>
            ) : null}
            <button
              type="button"
              className="link-quiet"
              onClick={() => {
                setJobsPanelOpen(true);
                setShowNewJob(true);
              }}
            >
              Add job
            </button>
          </div>
        </div>
        <div className="truck-actions" style={{ marginTop: 0, marginBottom: 12 }}>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void syncFromJobber()}
          >
            Sync Jobber
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setJobsPanelOpen(true);
              setShowNewJob(false);
            }}
          >
            View all
          </button>
        </div>
        {selectedJob && headline ? (
          <>
            <h2>
              {headline.number || selectedJob.name}
              <span className="badge badge-ok">On site</span>
            </h2>
            {headline.number ? <p>{headline.title}</p> : null}
            <p>
              <JobDateText
                iso={selectedJob.scheduledAt || selectedJob.createdAt}
                suffix=" · "
              />
              {selectedJob.location || "No address yet"}
            </p>
            {editingJob ? (
              <form onSubmit={(e) => void saveJobDetails(e)} style={{ marginTop: 14 }}>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="edit-job-name">Job name</label>
                    <input
                      id="edit-job-name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-job-location">Address</label>
                    <input
                      id="edit-job-location"
                      value={editLocation}
                      onChange={(e) => setEditLocation(e.target.value)}
                      required
                      placeholder="123 Main St"
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <span />
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    Save job
                  </button>
                </div>
              </form>
            ) : null}
          </>
        ) : (
          <div className="truck-active-job truck-active-job-empty" style={{ marginTop: 0 }}>
            <p className="hint" style={{ margin: 0 }}>
              {jobs.length === 0
                ? "No jobs yet — tap Sync Jobber to pull scheduled jobs onto this truck."
                : `${jobs.length} job${jobs.length === 1 ? "" : "s"} on this truck.`}
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setJobsPanelOpen(true);
                setShowNewJob(jobs.length === 0);
              }}
            >
              {jobs.length === 0 ? "Open jobs" : `Open jobs (${jobs.length})`}
            </button>
          </div>
        )}
      </section>

      </div>

      {stockPanelOpen ? (
        <div className="jobs-sheet" role="dialog" aria-modal="true" aria-label="Materials on this truck">
          <div className="jobs-sheet-panel panel animate-rise">
            <div className="section-head">
              <div>
                <p className="eyebrow">{truck.name}</p>
                <h2 className="section-title" style={{ margin: 0 }}>
                  Materials
                </h2>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStockPanelOpen(false)}
              >
                Done
              </button>
            </div>
            {stock.length === 0 ? (
              <p className="hint" style={{ margin: "12px 0" }}>
                Nothing on this truck yet. Add material from checkout.
              </p>
            ) : (
              <ul className="stock-lines">
                {stock.map((item) => (
                  <li key={item.itemId} className="stock-line">
                    <strong>{item.itemName}</strong>
                    <span>
                      {item.quantity} {item.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="truck-actions" style={{ marginTop: 16 }}>
              <Link href="/checkout" className="btn btn-accent">
                + Add Material
              </Link>
              {stock.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setStockPanelOpen(false);
                    openReturnSheet();
                  }}
                >
                  ↩ Return Material
                </button>
              ) : (
                <span />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {editingStock ? (
        <div className="jobs-sheet" role="dialog" aria-modal="true" aria-label="Return material">
          <div className="jobs-sheet-panel panel animate-rise">
            <div className="section-head">
              <div>
                <p className="eyebrow">On this truck</p>
                <h2 className="section-title" style={{ margin: 0 }}>
                  Return or move
                </h2>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setEditingStock(false);
                  setReturnQty({});
                }}
              >
                Done
              </button>
            </div>
            <p className="hint" style={{ margin: "8px 0 12px" }}>
              Select leftover material to send back to the warehouse or onto another truck.
            </p>
            <div className="return-line-head">
              <button
                type="button"
                className="link-quiet"
                onClick={() => {
                  const allSelected = stock.every(
                    (item) => (returnQty[item.itemId] || 0) > 0
                  );
                  if (allSelected) {
                    setReturnQty({});
                    return;
                  }
                  const next: Record<string, number> = {};
                  for (const item of stock) next[item.itemId] = item.quantity;
                  setReturnQty(next);
                }}
              >
                {stock.every((item) => (returnQty[item.itemId] || 0) > 0)
                  ? "Clear all"
                  : "Select all"}
              </button>
            </div>
            <div className="return-lines">
              {stock.map((item) => {
                const qty = returnQty[item.itemId] || 0;
                const checked = qty > 0;
                return (
                  <label key={item.itemId} className="return-line">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setReturnQty((prev) => ({
                          ...prev,
                          [item.itemId]: e.target.checked ? item.quantity : 0,
                        }))
                      }
                    />
                    <strong>{item.itemName}</strong>
                    <span className="return-on-truck">
                      {item.quantity} {item.unit}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={item.quantity}
                      step={0.25}
                      aria-label={`Quantity of ${item.itemName}`}
                      value={checked ? qty : ""}
                      placeholder="0"
                      onChange={(e) => {
                        const next = roundQty(Number(e.target.value) || 0);
                        setReturnQty((prev) => ({
                          ...prev,
                          [item.itemId]: Math.max(0, Math.min(item.quantity, next)),
                        }));
                      }}
                    />
                  </label>
                );
              })}
            </div>
            <div className="return-dest">
              <label htmlFor="return-dest">Send selected to</label>
              <select
                id="return-dest"
                value={returnDest}
                onChange={(e) => setReturnDest(e.target.value)}
              >
                <option value="warehouse">Warehouse</option>
                {otherTrucks.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || Object.values(returnQty).every((qty) => !qty)}
                onClick={() => void sendSelected()}
              >
                {returnDest === "warehouse" ? "Return to warehouse" : "Move to truck"}
              </button>
              {error ? <p className="form-error">{error}</p> : null}
              {message ? <p className="form-success">{message}</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {jobsPanelOpen ? (
        <div className="jobs-sheet" role="dialog" aria-modal="true" aria-label="Jobs">
          <div className="jobs-sheet-panel panel animate-rise">
            <div className="section-head">
              <div>
                <p className="eyebrow">Truck jobs</p>
                <h2 className="section-title" style={{ margin: 0 }}>
                  {truck.name}
                </h2>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setJobsPanelOpen(false);
                  setShowNewJob(false);
                  setJobQuery("");
                }}
              >
                Done
              </button>
            </div>

            <div className="form-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowNewJob((v) => !v)}
              >
                {showNewJob ? "Cancel new job" : "Add job"}
              </button>
            </div>

            {jobs.length > 0 ? (
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="truck-jobs-search">Search jobs</label>
                <input
                  id="truck-jobs-search"
                  placeholder="Name, address..."
                  value={jobQuery}
                  onChange={(e) => setJobQuery(e.target.value)}
                />
              </div>
            ) : null}

            {showNewJob ? (
              <form onSubmit={createJob} style={{ marginTop: 14 }}>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="job-name">Job name</label>
                    <input
                      id="job-name"
                      required
                      value={jobName}
                      onChange={(e) => setJobName(e.target.value)}
                      placeholder="Smith attic"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="job-location">Location</label>
                    <input
                      id="job-location"
                      required
                      value={jobLocation}
                      onChange={(e) => setJobLocation(e.target.value)}
                      placeholder="123 Main St"
                    />
                  </div>
                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <label htmlFor="job-notes">Notes</label>
                    <input
                      id="job-notes"
                      value={jobNotes}
                      onChange={(e) => setJobNotes(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <span />
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    Create job
                  </button>
                </div>
              </form>
            ) : null}

            {jobs.length === 0 ? (
              <p className="hint" style={{ marginTop: 14 }}>
                Jobs scheduled in Jobber for people on this truck appear here.
                Today’s jobs are listed first. You can still add a job by hand.
              </p>
            ) : visibleJobs.length === 0 ? (
              <p className="hint" style={{ marginTop: 14 }}>
                No jobs match “{jobQuery.trim()}”.
              </p>
            ) : (
              <div className="item-list" style={{ marginTop: 14 }}>
                {visibleJobs.map((job) => {
                  const active = selectedJobId === job.id;
                  return (
                    <article
                      key={job.id}
                      className={`panel expandable-card${active ? " is-open" : ""}`}
                    >
                      <button
                        type="button"
                        className="expandable-summary"
                        onClick={() => {
                          setSelectedJobId(job.id);
                          setSelected({});
                          setJobsPanelOpen(false);
                          setShowNewJob(false);
                          setMessage(`Working on “${job.name}”.`);
                        }}
                      >
                        <div className="expandable-summary-main">
                          <h2 className="item-name" style={{ margin: 0 }}>
                            {job.name}
                          </h2>
                          <div className="item-meta">
                            <JobDateText iso={job.scheduledAt || job.createdAt} />
                            {job.location ? <span>{job.location}</span> : null}
                            {(job.bagCount || 0) > 0 ? (
                              <span>{job.bagCount} bags</span>
                            ) : null}
                            {(job.materials || []).length > 0 ? (
                              <span>
                                {(job.materials || []).length} material
                                {(job.materials || []).length === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="expandable-summary-side">
                          {active ? (
                            <span className="badge badge-ok">Active</span>
                          ) : (
                            <span className="hint" style={{ margin: 0 }}>
                              Open
                            </span>
                          )}
                          <span className="expand-chevron" aria-hidden>
                            ▸
                          </span>
                        </div>
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {selectedJob && !jobsPanelOpen && !editingStock && !stockPanelOpen ? (
        <>
          <section className="panel tally-hero animate-rise" style={{ marginTop: 14 }}>
            <p className="eyebrow">Bag tally · {selectedJob.name}</p>
            <strong className="tally-total">{selectedJob.bagCount || 0}</strong>
            <p className="lede">Each bag comes off truck stock</p>

            {bagStock.length > 1 ? (
              <div className="field" style={{ maxWidth: 320, margin: "12px auto 0" }}>
                <label htmlFor="bag-product">Bag product on truck</label>
                <select
                  id="bag-product"
                  value={bagItemId}
                  onChange={(e) => setBagItemId(e.target.value)}
                >
                  {bagStock.map((item) => (
                    <option key={item.itemId} value={item.itemId}>
                      {item.itemName} ({item.quantity} {item.unit})
                    </option>
                  ))}
                </select>
              </div>
            ) : bagStock.length === 1 ? (
              <p className="hint" style={{ marginTop: 10 }}>
                From truck: {bagStock[0].itemName} ({bagStock[0].quantity} left)
              </p>
            ) : (
              <p className="hint" style={{ marginTop: 10 }}>
                No insulation bags on this truck.{" "}
                <Link href="/checkout">Check some out</Link> first.
              </p>
            )}

            <div className="field" style={{ maxWidth: 280, margin: "10px auto 0" }}>
              <label htmlFor="tally-name">Your name</label>
              <input
                id="tally-name"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="tally-actions">
              <button
                type="button"
                className="btn btn-primary tally-plus"
                disabled={busy || bagStock.length === 0}
                onClick={() => addBags(1)}
              >
                +1 bag
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || bagStock.length === 0}
                onClick={() => addBags(5)}
              >
                +5
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || (selectedJob.bagCount || 0) < 1}
                onClick={() => void removeBag()}
              >
                −1
              </button>
            </div>
          </section>

          <section className="panel form-panel animate-rise" style={{ marginTop: 14 }}>
            <h2 className="section-title">Other materials</h2>
            <p className="hint" style={{ marginTop: 6 }}>
              {selectedJob.location}
            </p>
            <p className="hint" style={{ marginTop: 6, marginBottom: 12 }}>
              Select a material and type how much was used. Decimals are allowed.
            </p>

            {usedOther.length > 0 ? (
              <div className="used-materials" style={{ marginBottom: 16 }}>
                {usedOther.map((material) => {
                  const qty = editingQty[material.itemId] ?? material.quantity;
                  const onTruck =
                    otherStock.find((item) => item.itemId === material.itemId)
                      ?.quantity || 0;
                  return (
                    <article
                      key={material.itemId}
                      className={`panel form-panel used-material-row${
                        openUsedId === material.itemId ? " is-open" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="checkout-select"
                        onClick={() =>
                          setOpenUsedId((id) =>
                            id === material.itemId ? null : material.itemId
                          )
                        }
                      >
                        <span
                          className={`check-box${
                            openUsedId === material.itemId ? " checked" : ""
                          }`}
                        >
                          {openUsedId === material.itemId ? "✓" : ""}
                        </span>
                        <span className="checkout-select-copy">
                          <strong>{material.itemName}</strong>
                          <span>
                            Used on job: {material.quantity} {material.unit}
                            {onTruck > 0 ? ` · on truck: ${onTruck}` : ""}
                          </span>
                        </span>
                      </button>
                      {openUsedId === material.itemId ? (
                      <>
                      <div className="field">
                        <label htmlFor={`used-${material.itemId}`}>Qty used</label>
                        <input
                          id={`used-${material.itemId}`}
                          className="qty-input"
                          type="text"
                          inputMode="decimal"
                          value={
                            Object.prototype.hasOwnProperty.call(
                              qtyDraft,
                              `used-${material.itemId}`
                            )
                              ? qtyDraft[`used-${material.itemId}`]
                              : String(qty)
                          }
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (!isQtyDraft(raw)) return;
                            setQtyDraft((prev) => ({
                              ...prev,
                              [`used-${material.itemId}`]: raw,
                            }));
                            setEditingQty((prev) => ({
                              ...prev,
                              [material.itemId]: qtyFromDraft(raw),
                            }));
                          }}
                          onBlur={() => {
                            const cap = material.quantity + onTruck;
                            const next = finishQty(
                              qtyDraft[`used-${material.itemId}`] ?? String(qty),
                              cap
                            );
                            setEditingQty((prev) => ({
                              ...prev,
                              [material.itemId]: next,
                            }));
                            setQtyDraft((prev) => ({
                              ...prev,
                              [`used-${material.itemId}`]: String(next),
                            }));
                          }}
                        />
                      </div>
                      <div className="login-row-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy || qty === material.quantity}
                          onClick={() => void saveUsedQty(material.itemId)}
                        >
                          Save qty
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={busy}
                          onClick={() => void saveUsedQty(material.itemId, 0)}
                        >
                          Return to truck
                        </button>
                      </div>
                      {otherJobs.length > 0 ? (
                        <div className="field" style={{ marginTop: 8 }}>
                          <label htmlFor={`move-${material.itemId}`}>
                            Wrong job? Move to
                          </label>
                          <div className="inline-add">
                            <select
                              id={`move-${material.itemId}`}
                              value={moveToJob[material.itemId] || ""}
                              onChange={(e) =>
                                setMoveToJob((prev) => ({
                                  ...prev,
                                  [material.itemId]: e.target.value,
                                }))
                              }
                            >
                              <option value="">Select job</option>
                              {otherJobs.map((job) => (
                                <option key={job.id} value={job.id}>
                                  {job.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={busy || !moveToJob[material.itemId] || qty <= 0}
                              onClick={() => void moveUsed(material.itemId)}
                            >
                              Move
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="hint">
                          Add another job on this truck to move material onto it.
                        </p>
                      )}
                      </>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : null}

            {otherStock.length === 0 ? (
              <p className="hint">No other materials on this truck right now.</p>
            ) : (
              <div className="item-list">
                {otherStock.map((item) => {
                    const isSelected = Object.prototype.hasOwnProperty.call(selected, item.itemId);
                    const max = item.quantity;
                    return (
                      <article
                        key={item.itemId}
                        className={`panel checkout-row${isSelected ? " checkout-row-selected" : ""}`}
                      >
                        <button
                          type="button"
                          className="checkout-select"
                          onClick={() => {
                            const id = item.itemId;
                            if (Object.prototype.hasOwnProperty.call(selected, id)) {
                              setSelected((prev) => {
                                const next = { ...prev };
                                delete next[id];
                                return next;
                              });
                              setQtyDraft((prev) => {
                                const next = { ...prev };
                                delete next[id];
                                return next;
                              });
                              return;
                            }
                            setSelected((prev) => ({ ...prev, [id]: 0 }));
                            setQtyDraft((prev) => ({ ...prev, [id]: "" }));
                          }}
                        >
                          <span className={`check-box${isSelected ? " checked" : ""}`}>
                            {isSelected ? "✓" : ""}
                          </span>
                          <span className="checkout-select-copy">
                            <strong>{item.itemName}</strong>
                            <span>
                              On truck: {item.quantity} {item.unit}
                            </span>
                          </span>
                        </button>
                        {isSelected ? (
                        <div className="checkout-qty">
                            <label htmlFor={`use-${item.itemId}`}>Qty used</label>
                            <input
                              id={`use-${item.itemId}`}
                              className="qty-input"
                              type="text"
                              inputMode="decimal"
                              placeholder="0"
                              value={
                                Object.prototype.hasOwnProperty.call(
                                  qtyDraft,
                                  item.itemId
                                )
                                  ? qtyDraft[item.itemId]
                                  : selected[item.itemId]
                                    ? String(selected[item.itemId])
                                    : ""
                              }
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (!isQtyDraft(raw)) return;
                                setQtyDraft((prev) => ({
                                  ...prev,
                                  [item.itemId]: raw,
                                }));
                                setSelected((prev) => ({
                                  ...prev,
                                  [item.itemId]: qtyFromDraft(raw),
                                }));
                              }}
                              onBlur={() => {
                                const next = finishQty(
                                  qtyDraft[item.itemId] ??
                                    String(selected[item.itemId] ?? ""),
                                  max
                                );
                                setSelected((prev) => ({
                                  ...prev,
                                  [item.itemId]: next,
                                }));
                                setQtyDraft((prev) => ({
                                  ...prev,
                                  [item.itemId]: next ? String(next) : "",
                                }));
                              }}
                            />
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
              </div>
            )}

            <div className="form-actions">
              <span />
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || otherStock.length === 0}
                onClick={useOnJob}
              >
                Use on job
              </button>
            </div>
          </section>
        </>
      ) : null}

      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
