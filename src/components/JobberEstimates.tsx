"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatQty } from "@/lib/usage";
import { formatJobDateLabel } from "@/lib/jobSort";
import type { EstimatedJob, EstimatedMaterial } from "@/lib/jobber";

type StatusPayload = {
  configured: boolean;
  connected: boolean;
  accountName: string;
  connectedAt: string;
};

type EstimatePayload = {
  jobs: EstimatedJob[];
  totals: EstimatedMaterial[];
  templatesCount: number;
  meta?: {
    scanned: number;
    matched: number;
    pages: number;
    truncated: boolean;
    fromCache?: boolean;
    cacheAgeMinutes?: number | null;
  };
};

function toYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday of the week containing `d` (local). */
function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

function defaultRange() {
  const from = startOfWeek(new Date());
  const to = new Date(from);
  to.setDate(to.getDate() + 13);
  return { from: toYmd(from), to: toYmd(to) };
}

export function JobberEstimates() {
  const defaults = defaultRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [includeUndated, setIncludeUndated] = useState(false);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [data, setData] = useState<EstimatePayload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  const [preview, setPreview] = useState<{
    matched: number;
    unmatchedNames: string[];
    preview: Array<{
      name: string;
      location: string;
      scheduledAt: string | null;
      assignedNames: string[];
      truckName: string;
    }>;
  } | null>(null);
  const [openJobId, setOpenJobId] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/jobber/status");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Could not load Jobber status");
    setStatus(json);
    return json as StatusPayload;
  }, []);

  const loadEstimates = useCallback(
    async (force = false) => {
      const params = new URLSearchParams({
        from,
        to,
        includeUndated: includeUndated ? "1" : "0",
      });
      if (force) params.set("force", "1");
      const res = await fetch(`/api/jobber/estimates?${params}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Could not load upcoming material");
      }
      setData({
        jobs: json.jobs || [],
        totals: json.totals || [],
        templatesCount: json.templatesCount || 0,
        meta: json.meta,
      });
    },
    [from, to, includeUndated]
  );

  const refresh = useCallback(
    async (force = false) => {
      setBusy(true);
      setError("");
      try {
        const nextStatus = await loadStatus();
        if (nextStatus.configured && nextStatus.connected) {
          await loadEstimates(force);
        } else {
          setData(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load");
      } finally {
        setBusy(false);
        setBooting(false);
      }
    },
    [loadStatus, loadEstimates]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) {
      setError(params.get("error") || "");
    }
    if (params.get("connected")) {
      window.history.replaceState({}, "", "/estimates");
    }
    void refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(kind: "week" | "twoWeeks" | "month") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (kind === "week") {
      const start = startOfWeek(today);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      setFrom(toYmd(start));
      setTo(toYmd(end));
      return;
    }
    if (kind === "twoWeeks") {
      const start = startOfWeek(today);
      const end = new Date(start);
      end.setDate(end.getDate() + 13);
      setFrom(toYmd(start));
      setTo(toYmd(end));
      return;
    }
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    setFrom(toYmd(start));
    setTo(toYmd(end));
  }

  async function previewTruckJobs() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/jobber/sync-jobs?preview=1");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not preview Jobber jobs");
      setPreview({
        matched: json.matched || 0,
        unmatchedNames: json.unmatchedNames || [],
        preview: json.preview || [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not preview Jobber jobs");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect Jobber from TSI INV?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/jobber/disconnect", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not disconnect");
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect");
      setBusy(false);
    }
  }

  if (booting && !status) {
    return (
      <div className="panel empty animate-rise">
        <h2>Loading Jobber...</h2>
        <p>Checking connection and templates.</p>
      </div>
    );
  }

  const configured = Boolean(status?.configured);
  const connected = Boolean(status?.connected);

  return (
    <div className="upcoming-page">
      <section className="panel upcoming-status animate-rise">
        <div className="upcoming-status-main">
          <p className="eyebrow">Jobber account</p>
          <h2 className="section-title">
            {connected
              ? status?.accountName || "Connected"
              : configured
                ? "Not connected"
                : "Not configured"}
          </h2>
          <div className="upcoming-stats">
            <span>
              <strong>{data?.templatesCount ?? 0}</strong> templates
            </span>
            {data?.meta ? (
              <>
                <span>
                  <strong>{data.meta.matched}</strong> in range
                </span>
                <span>
                  <strong>{data.meta.scanned}</strong> scanned
                  {data.meta.fromCache
                    ? ` · cached ${data.meta.cacheAgeMinutes ?? 0}m`
                    : ""}
                </span>
              </>
            ) : null}
          </div>
        </div>
        <div className="upcoming-status-actions">
          <Link href="/templates" className="btn btn-secondary">
            Templates
          </Link>
          {connected ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => refresh(true)}
                title="Pull fresh jobs from Jobber"
              >
                Refresh
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void previewTruckJobs()}
              >
                Preview truck jobs
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() => disconnect()}
              >
                Disconnect
              </button>
            </>
          ) : configured ? (
            <a href="/api/jobber/connect" className="btn btn-primary">
              Connect Jobber
            </a>
          ) : null}
        </div>
      </section>

      {preview ? (
        <section className="panel animate-rise">
          <p className="eyebrow">Truck job preview · not saved</p>
          <h2 className="section-title">
            {preview.matched} job{preview.matched === 1 ? "" : "s"} would go on trucks
          </h2>
          <p className="hint">
            This only shows what would happen. It does not add or change jobs.
          </p>
          {preview.unmatchedNames.length > 0 ? (
            <p className="form-error">
              No login match for: {preview.unmatchedNames.join(", ")}
            </p>
          ) : (
            <p className="form-success">Every Jobber name matched a login.</p>
          )}
          {preview.preview.length === 0 ? (
            <p className="hint">
              Nothing to place. Check that Jobber jobs have assigned people
              whose names match Settings → Logins, and that those logins have a
              truck.
            </p>
          ) : (
            <div className="item-list" style={{ marginTop: 12 }}>
              {preview.preview.map((job, index) => (
                <article key={`${job.name}-${job.truckName}-${index}`} className="panel">
                  <strong>{job.name}</strong>
                  <p className="hint" style={{ margin: "4px 0 0" }}>
                    {formatJobDateLabel(job.scheduledAt) || "No date"} ·{" "}
                    {job.truckName}
                    {job.location ? ` · ${job.location}` : ""}
                  </p>
                  <p className="hint" style={{ margin: "4px 0 0" }}>
                    Assigned: {job.assignedNames.join(", ") || "none"}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {connected ? (
        <section className="panel upcoming-range animate-rise">
          <div className="upcoming-range-head">
            <div>
              <p className="eyebrow">Date range</p>
              <h2 className="section-title">Which jobs to include</h2>
            </div>
          </div>

          <div className="upcoming-range-grid">
            <div className="field">
              <label htmlFor="range-from">From</label>
              <input
                id="range-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="range-to">To</label>
              <input
                id="range-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          <label className="checkbox-row upcoming-check">
            <input
              type="checkbox"
              checked={includeUndated}
              onChange={(e) => setIncludeUndated(e.target.checked)}
            />
            Include jobs with no start date
          </label>

          <div className="upcoming-range-footer">
            <div className="upcoming-presets">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => applyPreset("week")}
              >
                This week
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => applyPreset("twoWeeks")}
              >
                2 weeks
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => applyPreset("month")}
              >
                This month
              </button>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => refresh(false)}
              title="Filter the cached Jobber jobs by date"
            >
              {busy ? "Loading..." : "Apply dates"}
            </button>
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="upcoming-banner upcoming-banner-danger" role="alert">
          {error}
        </div>
      ) : null}

      {data?.meta?.truncated ? (
        <div className="upcoming-banner upcoming-banner-warn" role="status">
          Showing the newest {data.meta.scanned} non-archived jobs from Jobber
          (Cloudflare request limit). Use a tighter date range, or tap Refresh
          again later.
        </div>
      ) : null}

      {!configured ? (
        <div className="panel empty animate-rise">
          <h2>Set up Jobber credentials</h2>
          <p>
            Create an app in the Jobber Developer Center, then add{" "}
            <code>JOBBER_CLIENT_ID</code> and <code>JOBBER_CLIENT_SECRET</code>{" "}
            to your environment (local <code>.dev.vars</code> or Cloudflare
            Worker variables). Callback URL:
          </p>
          <p>
            <code>
              {typeof window !== "undefined"
                ? `${window.location.origin}/api/jobber/callback`
                : "/api/jobber/callback"}
            </code>
          </p>
          <p className="lede">
            You can still create line-item templates now — estimates unlock after
            connect.
          </p>
          <Link href="/templates" className="btn btn-primary">
            Create templates
          </Link>
        </div>
      ) : !connected ? (
        <div className="panel empty animate-rise">
          <h2>Connect your Jobber account</h2>
          <p>
            Authorize TSI INV to read upcoming jobs, line items, and Users (the
            Team column). If you just turned on Users read, tap Disconnect then
            Connect Jobber — the old connection does not pick up new scopes.
            Jobber’s Allow Access screen must list Users, and you must connect
            as a Jobber admin.
          </p>
          <a href="/api/jobber/connect" className="btn btn-primary">
            Connect Jobber
          </a>
        </div>
      ) : (
        <>
          {(data?.totals || []).length > 0 ? (
            <section className="panel upcoming-block animate-rise">
              <div className="upcoming-block-head">
                <div>
                  <p className="eyebrow">
                    {from} → {to}
                  </p>
                  <h2 className="section-title">Materials needed</h2>
                </div>
              </div>
              <div className="usage-table-wrap">
                <table className="usage-table">
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Needed</th>
                      <th>On hand</th>
                      <th>Short</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.totals.map((row) => (
                      <tr key={row.itemId}>
                        <td>
                          <strong>{row.itemName}</strong>
                          <span className="usage-unit">{row.unit}</span>
                        </td>
                        <td>{formatQty(row.quantity)}</td>
                        <td>{formatQty(row.stockOnHand)}</td>
                        <td
                          className={
                            row.shortfall > 0 ? "money-neg" : "money-pos"
                          }
                        >
                          {row.shortfall > 0
                            ? formatQty(row.shortfall)
                            : "OK"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="upcoming-jobs-section">
            <div className="upcoming-block-head upcoming-jobs-head">
              <div>
                <p className="eyebrow">Job list</p>
                <h2 className="section-title">
                  {data?.jobs.length
                    ? `${data.jobs.length} job${data.jobs.length === 1 ? "" : "s"}`
                    : "Jobs"}
                </h2>
              </div>
            </div>

            {busy && !data ? (
              <div className="panel empty animate-rise">
                <h2>Loading jobs...</h2>
                <p>Pulling Jobber line items for this date range.</p>
              </div>
            ) : (data?.jobs.length || 0) === 0 && !error ? (
              <div className="panel empty animate-rise">
                <h2>No jobs in this date range</h2>
                <p>
                  Scanned {data?.meta?.scanned ?? 0} non-archived Jobber jobs;
                  none matched {from} → {to}. Try a wider range or turn on
                  “Include jobs with no start date.”
                </p>
                <Link href="/templates" className="btn btn-secondary">
                  Manage templates
                </Link>
              </div>
            ) : data ? (
              <div className="upcoming-job-list">
                {data.jobs.map((job, index) => {
                  const open = openJobId === job.id;
                  return (
                    <article
                      key={job.id}
                      className={`panel expandable-card upcoming-job-card animate-rise${open ? " is-open" : ""}`}
                      style={{
                        animationDelay: `${Math.min(index, 8) * 40}ms`,
                      }}
                    >
                      <button
                        type="button"
                        className="expandable-summary"
                        aria-expanded={open}
                        onClick={() =>
                          setOpenJobId((id) => (id === job.id ? null : job.id))
                        }
                      >
                        <div className="expandable-summary-main">
                          <h3 className="upcoming-job-title">
                            {job.title}
                            {job.jobNumber != null ? (
                              <span className="upcoming-job-number">
                                #{job.jobNumber}
                              </span>
                            ) : null}
                          </h3>
                          <div className="upcoming-job-meta">
                            {job.address ? <span>{job.address}</span> : null}
                            <span>
                              {job.startAt
                                ? formatWhen(job.startAt)
                                : "No start date"}
                            </span>
                          </div>
                        </div>
                        <div className="expandable-summary-side">
                          <span className="badge badge-ok">{job.jobStatus}</span>
                          <span className="expand-chevron" aria-hidden>
                            {open ? "▾" : "▸"}
                          </span>
                        </div>
                      </button>

                      {open ? (
                        <div className="expandable-details">
                          <p className="hint" style={{ marginBottom: 10 }}>
                            {job.lineItems.filter((l) => l.matched).length}/
                            {job.lineItems.length} lines matched
                          </p>
                          <div className="estimate-lines">
                            {job.lineItems.map((line) => (
                              <div key={line.id} className="estimate-line">
                                <div className="item-title-row">
                                  <strong>
                                    {line.quantity}× {line.name}
                                  </strong>
                                  <span
                                    className={
                                      line.matched
                                        ? "badge badge-ok"
                                        : "badge badge-out"
                                    }
                                  >
                                    {line.matched ? "Matched" : "No template"}
                                  </span>
                                </div>
                                {line.matched ? (
                                  <ul className="job-materials">
                                    {line.materials.map((m) => (
                                      <li key={`${line.id}-${m.itemId}`}>
                                        {formatQty(m.quantity)} {m.unit}{" "}
                                        {m.itemName}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="lede" style={{ marginTop: 6 }}>
                                    Create a template named “{line.name}”.{" "}
                                    <Link href="/templates">Add template</Link>
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>

                          {job.materials.length > 0 ? (
                            <footer className="upcoming-job-total">
                              <span>Job total</span>
                              <strong>
                                {job.materials
                                  .map(
                                    (m) =>
                                      `${formatQty(m.quantity)} ${m.unit} ${m.itemName}`
                                  )
                                  .join(" · ")}
                              </strong>
                            </footer>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
