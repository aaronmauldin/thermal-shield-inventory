"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { isDemoUsageJob } from "@/lib/demo-usage-mark";
import type { JobRecord } from "@/lib/types";
import {
  buildPeriodBuckets,
  formatQty,
  materialAverages,
  periodWord as periodWordFor,
  usageSummary,
  type PeriodMode,
} from "@/lib/usage";

export function JobsBrowser() {
  const [jobs, setJobs] = useState<JobRecord[] | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<PeriodMode>("day");
  const [materialKey, setMaterialKey] = useState("all");
  const [error, setError] = useState("");
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    fetch("/api/jobs")
      .then((res) => {
        if (!res.ok) throw new Error("Could not load jobs");
        return res.json();
      })
      .then((data: JobRecord[]) => setJobs(data))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load jobs")
      );
  }, []);

  const countedJobs = useMemo(
    () => (jobs ? jobs.filter((job) => !isDemoUsageJob(job)) : null),
    [jobs]
  );

  const visible = useMemo(() => {
    if (!countedJobs) return [];
    const q = query.trim().toLowerCase();
    if (!q) return countedJobs;
    return countedJobs.filter((job) => {
      const hay = [
        job.name,
        job.location,
        job.notes,
        job.truckName,
        ...(job.materials || []).map((m) => m.itemName),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [countedJobs, query]);

  const buckets = useMemo(
    () => buildPeriodBuckets(visible, mode),
    [visible, mode]
  );
  const averages = useMemo(
    () => materialAverages(visible, buckets),
    [visible, buckets]
  );
  const summary = useMemo(
    () => usageSummary(visible, buckets),
    [visible, buckets]
  );

  useEffect(() => {
    if (
      materialKey !== "all" &&
      averages.length > 0 &&
      !averages.some((m) => m.key === materialKey)
    ) {
      setMaterialKey("all");
    }
  }, [averages, materialKey]);

  const selectedMaterial = averages.find((m) => m.key === materialKey);
  const chartValues = useMemo(() => {
    return buckets.map((bucket) => {
      if (materialKey === "all") return bucket.units;
      return bucket.byMaterial[materialKey]?.quantity || 0;
    });
  }, [buckets, materialKey]);

  const chartMax = Math.max(1, ...chartValues);
  const periodWord = periodWordFor(mode);

  async function loadDemoJobs() {
    if (seeding) return;
    setSeeding(true);
    setError("");
    try {
      const res = await fetch("/api/jobs/demo-usage", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add sample jobs");
      const jobsRes = await fetch("/api/jobs");
      if (!jobsRes.ok) throw new Error("Could not reload jobs");
      setJobs(await jobsRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add sample jobs");
    } finally {
      setSeeding(false);
    }
  }

  const chartTitle =
    materialKey === "all"
      ? `All materials by ${periodWord}`
      : `${selectedMaterial?.name || "Material"} by ${periodWord}`;

  if (error && !jobs) {
    return (
      <div className="panel empty animate-rise">
        <h2>Couldn’t load jobs</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!jobs) {
    return (
      <div className="panel empty animate-rise">
        <h2>Loading usage...</h2>
        <p>Pulling every material used on jobs.</p>
      </div>
    );
  }

  return (
    <div className="usage-page">
      <section className="panel filters animate-rise">
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label htmlFor="jobs-search">Search jobs</label>
          <input
            id="jobs-search"
            placeholder="Search jobs by name, address, truck..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="field">
          <label>View by</label>
          <div className="segmented" role="group" aria-label="Period">
            <button
              type="button"
              className={mode === "day" ? "active" : undefined}
              onClick={() => setMode("day")}
            >
              Days
            </button>
            <button
              type="button"
              className={mode === "week" ? "active" : undefined}
              onClick={() => setMode("week")}
            >
              Weeks
            </button>
            <button
              type="button"
              className={mode === "month" ? "active" : undefined}
              onClick={() => setMode("month")}
            >
              Months
            </button>
          </div>
        </div>
        {process.env.NODE_ENV !== "production" ? (
          <div className="field" style={{ justifyContent: "end" }}>
            <label>&nbsp;</label>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={seeding}
              onClick={() => void loadDemoJobs()}
            >
              {seeding ? "Adding sample jobs..." : "Add 2 months of sample jobs"}
            </button>
          </div>
        ) : null}
      </section>
      {error ? <p className="form-error">{error}</p> : null}

      <section className="stat-row animate-rise">
        <div className="panel stat">
          <span>Jobs</span>
          <strong>{summary.jobCount}</strong>
        </div>
        <div className="panel stat">
          <span>Materials used</span>
          <strong>{formatQty(summary.units)}</strong>
        </div>
        <div className="panel stat">
          <span>Avg / {periodWord}</span>
          <strong>{formatQty(summary.avgUnitsPerPeriod)}</strong>
        </div>
      </section>

      <section className="panel usage-chart-panel animate-rise">
        <div className="usage-chart-head">
          <div>
            <p className="eyebrow">Usage chart</p>
            <h2 className="section-title">{chartTitle}</h2>
          </div>
          <div className="field" style={{ margin: 0, minWidth: 160 }}>
            <label htmlFor="material-filter">Material</label>
            <select
              id="material-filter"
              value={materialKey}
              onChange={(e) => setMaterialKey(e.target.value)}
            >
              <option value="all">All materials</option>
              {averages.map((row) => (
                <option key={row.key} value={row.key}>
                  {row.name} ({row.unit})
                </option>
              ))}
            </select>
          </div>
        </div>

        {buckets.length === 0 ? (
          <div className="usage-chart-empty">
            <p>
              No jobs in this view yet. Use any materials on truck jobs to fill
              the chart.
            </p>
            <Link href="/trucks" className="btn btn-primary">
              Open trucks
            </Link>
          </div>
        ) : (
          <>
            <div className="usage-chart" role="img" aria-label="Usage chart">
              {buckets.map((bucket, i) => {
                const value = chartValues[i] || 0;
                const height = Math.max(4, Math.round((value / chartMax) * 100));
                const unitLabel =
                  materialKey === "all"
                    ? "units"
                    : selectedMaterial?.unit || "units";
                return (
                  <div key={bucket.key} className="usage-bar-col">
                    <span className="usage-bar-value">
                      {value > 0 ? formatQty(value) : ""}
                    </span>
                    <div className="usage-bar-track">
                      <div
                        className={`usage-bar-fill${value === 0 ? " is-empty" : ""}`}
                        style={{ height: `${height}%` }}
                        title={`${bucket.label}: ${formatQty(value)} ${unitLabel}`}
                      />
                    </div>
                    <span className="usage-bar-label">
                      {shortLabel(bucket.label, mode)}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="usage-chart-caption">
              {materialKey === "all" ? (
                <>
                  {averages.length} material
                  {averages.length === 1 ? "" : "s"} · avg{" "}
                  {formatQty(summary.avgUnitsPerJob)} units per job ·{" "}
                  {summary.activePeriods} active{" "}
                  {periodWord}
                  {summary.activePeriods === 1 ? "" : "s"}
                </>
              ) : (
                <>
                  Total {formatQty(selectedMaterial?.total || 0)}{" "}
                  {selectedMaterial?.unit} · avg{" "}
                  {formatQty(selectedMaterial?.avgPerJob || 0)} per job
                  that used it · avg{" "}
                  {formatQty(selectedMaterial?.avgPerPeriod || 0)} per{" "}
                  {periodWord} used
                </>
              )}
            </p>
          </>
        )}
      </section>

      {averages.length > 0 ? (
        <section className="panel animate-rise" style={{ marginBottom: 14 }}>
          <p className="eyebrow">Averages</p>
          <h2 className="section-title">Every material</h2>
          <p className="lede" style={{ marginBottom: 12 }}>
            Averages count only jobs that used that material — not empty
            Jobber jobs.
          </p>
          <div className="usage-table-wrap">
            <table className="usage-table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Total</th>
                  <th>Avg / job used</th>
                  <th>Avg / {periodWord} used</th>
                </tr>
              </thead>
              <tbody>
                {averages.map((row) => (
                  <tr
                    key={row.key}
                    className={
                      materialKey === row.key ? "is-selected" : undefined
                    }
                    onClick={() => setMaterialKey(row.key)}
                  >
                    <td>
                      <strong>{row.name}</strong>
                      <span className="usage-unit">{row.unit}</span>
                    </td>
                    <td>
                      {formatQty(row.total)} {row.unit}
                    </td>
                    <td>{formatQty(row.avgPerJob)}</td>
                    <td>{formatQty(row.avgPerPeriod)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="section-head" style={{ marginBottom: 10 }}>
        <h2 className="section-title">Jobs</h2>
        <Link href="/trucks" className="btn btn-secondary">
          Trucks
        </Link>
      </section>

      <section className="panel filters animate-rise" style={{ marginBottom: 12 }}>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label htmlFor="jobs-list-search">Search jobs</label>
          <input
            id="jobs-list-search"
            placeholder="Name, address, truck..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </section>

      {visible.length === 0 ? (
        <div className="panel empty animate-rise">
          <h2>{query ? "No matching jobs" : "No jobs yet"}</h2>
          <p>
            {query
              ? "Try a different search."
              : "Create a job on a truck and use materials — every item shows up here by week and month."}
          </p>
          <Link href="/trucks" className="btn btn-primary">
            Open trucks
          </Link>
        </div>
      ) : (
        <section className="item-list">
          {visible.map((job, index) => {
            const materials = job.materials || [];
            const units = materials.reduce(
              (sum, m) => sum + (Number(m.quantity) || 0),
              0
            );
            const open = openJobId === job.id;
            return (
              <article
                key={job.id}
                className={`panel expandable-card animate-rise${open ? " is-open" : ""}`}
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
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
                    <h2 className="item-name" style={{ margin: 0 }}>
                      {job.name}
                    </h2>
                    <div className="item-meta">
                      {job.location ? <span>{job.location}</span> : null}
                      {job.truckName ? <span>{job.truckName}</span> : null}
                      <span>{formatWhen(job.createdAt)}</span>
                    </div>
                  </div>
                  <div className="expandable-summary-side">
                    <span className="badge badge-ok">
                      {materials.length > 0
                        ? `${materials.length} material${materials.length === 1 ? "" : "s"}`
                        : "No materials"}
                    </span>
                    <span className="expand-chevron" aria-hidden>
                      {open ? "▾" : "▸"}
                    </span>
                  </div>
                </button>

                {open ? (
                  <div className="expandable-details">
                    {job.notes ? (
                      <p className="lede" style={{ margin: "0 0 10px" }}>
                        {job.notes}
                      </p>
                    ) : null}
                    {units > 0 ? (
                      <p className="hint" style={{ marginBottom: 8 }}>
                        {formatQty(units)} total units used
                        {(job.bagCount || 0) > 0
                          ? ` · ${job.bagCount} bags`
                          : ""}
                      </p>
                    ) : null}
                    {materials.length > 0 ? (
                      <ul className="job-materials">
                        {materials.map((m) => (
                          <li key={`${job.id}-${m.itemId}`}>
                            {m.quantity} {m.unit} {m.itemName}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="lede" style={{ margin: 0 }}>
                        No materials logged on this job yet.
                      </p>
                    )}
                    {job.truckId ? (
                      <div className="job-card-actions">
                        <Link
                          href={`/trucks/${job.truckId}`}
                          className="btn btn-secondary"
                        >
                          Open truck
                        </Link>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

function shortLabel(label: string, mode: PeriodMode) {
  if (mode === "month") return label.split(" ")[0];
  if (mode === "day") {
    const parts = label.split(" ");
    return parts[parts.length - 1] || label;
  }
  const start = label.split("–")[0]?.trim() || label;
  const parts = start.split(" ");
  return parts[parts.length - 1] || start;
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
