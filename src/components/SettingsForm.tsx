"use client";

import { useState } from "react";
import type { AppSettings } from "@/lib/types";
import { PushNotifications } from "./PushNotifications";

type Props = {
  initialSettings: AppSettings;
};

export function SettingsForm({ initialSettings }: Props) {
  const [settings, setSettings] = useState(initialSettings);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Could not save settings");
      const next = (await res.json()) as AppSettings;
      setSettings(next);
      setMessage("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setBusy(false);
    }
  }

  async function testAlert() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/alerts/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      if (!data.sent) {
        setError(data.reason || "Alert was not sent");
      } else {
        const channels = [
          data.emailSent ? "email" : null,
          data.pushSent
            ? `push (${data.pushDevices} phone${data.pushDevices === 1 ? "" : "s"})`
            : null,
        ].filter(Boolean);
        setMessage(
          `Alert sent via ${channels.join(" + ") || "channels"} for ${data.count} item(s): ${data.items.join(", ")}`
        );
      }
    } catch {
      setError("Could not send alert");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="panel form-panel animate-rise" onSubmit={save}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="companyName">Company name</label>
            <input
              id="companyName"
              value={settings.companyName}
              onChange={(e) =>
                setSettings({ ...settings, companyName: e.target.value })
              }
            />
          </div>

          <div className="field">
            <label htmlFor="alertEmail">Alert email</label>
            <input
              id="alertEmail"
              type="email"
              placeholder="orders@yourcompany.com"
              value={settings.alertEmail}
              onChange={(e) =>
                setSettings({ ...settings, alertEmail: e.target.value })
              }
            />
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settings.alertsEnabled}
                onChange={(e) =>
                  setSettings({ ...settings, alertsEnabled: e.target.checked })
                }
              />
              Send alerts when stock hits the low threshold (email + phone push)
            </label>
          </div>

          <div className="field">
            <label htmlFor="smtpHost">SMTP host</label>
            <input
              id="smtpHost"
              placeholder="smtp.gmail.com"
              value={settings.smtpHost}
              onChange={(e) =>
                setSettings({ ...settings, smtpHost: e.target.value })
              }
            />
          </div>

          <div className="field">
            <label htmlFor="smtpPort">SMTP port</label>
            <input
              id="smtpPort"
              type="number"
              value={settings.smtpPort}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  smtpPort: Number(e.target.value) || 587,
                })
              }
            />
          </div>

          <div className="field">
            <label htmlFor="smtpUser">SMTP username</label>
            <input
              id="smtpUser"
              value={settings.smtpUser}
              onChange={(e) =>
                setSettings({ ...settings, smtpUser: e.target.value })
              }
            />
          </div>

          <div className="field">
            <label htmlFor="smtpPass">SMTP password / app password</label>
            <input
              id="smtpPass"
              type="password"
              value={settings.smtpPass}
              onChange={(e) =>
                setSettings({ ...settings, smtpPass: e.target.value })
              }
            />
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="smtpFrom">From address</label>
            <input
              id="smtpFrom"
              placeholder="inventory@yourcompany.com"
              value={settings.smtpFrom}
              onChange={(e) =>
                setSettings({ ...settings, smtpFrom: e.target.value })
              }
            />
          </div>
        </div>

        <p className="hint">
          On Cloudflare, use a free <code>RESEND_API_KEY</code> (see CLOUDFLARE.md).
          Locally, Gmail SMTP works with an App Password on{" "}
          <code>smtp.gmail.com</code> port 587.
        </p>

        {message ? <p className="form-success">{message}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={testAlert}
          >
            Send test alert
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Working..." : "Save settings"}
          </button>
        </div>
      </form>

      <PushNotifications onStatus={setMessage} />
    </>
  );
}
