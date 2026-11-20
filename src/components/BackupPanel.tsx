"use client";

import { useState } from "react";

export function BackupPanel() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/backup");
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || !contentType.includes("application/json")) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not download backup");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || "tsi-inv-backup.json";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("Backup downloaded. Store that file where only admins can open it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download backup");
    } finally {
      setBusy(false);
    }
  }

  async function restoreFile(file: File | undefined) {
    if (!file) return;
    const confirmed = confirm(
      "Replace stock, trucks, jobs, templates, and checkout history with this backup? Logins and the Jobber connection on this site stay as they are."
    );
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const text = await file.text();
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not restore backup");
      setMessage(
        `Restored ${data.items ?? 0} materials, ${data.trucks ?? 0} trucks, and ${data.jobs ?? 0} jobs.`
      );
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore backup");
      setBusy(false);
    }
  }

  return (
    <section className="panel form-panel" style={{ marginTop: 16 }}>
      <p className="eyebrow">Backup</p>
      <h2 className="section-title">Download or restore stock</h2>
      <p>
        The file contains stock, trucks, jobs, templates, checkout history, job
        addresses, and employee names. It does not include passwords, Jobber
        tokens, or the email password. Treat the file as private.
      </p>
      <p>
        To restore, choose a file from Download backup. That replaces inventory
        on this site. People keep their logins. If Jobber was connected, it
        stays connected. On a brand-new install, sign in first, then restore,
        then connect Jobber again and re-enter the email password if you use
        SMTP.
      </p>
      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      <div className="form-actions">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void download()}
        >
          {busy ? "Working..." : "Download backup"}
        </button>
        <label className="btn btn-primary" style={{ cursor: busy ? "default" : "pointer" }}>
          {busy ? "Working..." : "Restore backup"}
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void restoreFile(file);
            }}
          />
        </label>
      </div>
    </section>
  );
}
