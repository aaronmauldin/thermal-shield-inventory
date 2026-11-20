"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone =
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return mq || iosStandalone;
}

async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("This browser does not support service workers");
  }
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js?v=2", { scope: "/" });
}

type Props = {
  onStatus?: (message: string) => void;
};

export function PushNotifications({ onStatus }: Props) {
  const [supported, setSupported] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const pushOk =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(pushOk);
    setStandalone(isStandaloneDisplay());
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }

    let cancelled = false;
    (async () => {
      try {
        const vapidRes = await fetch("/api/push/vapid");
        const vapid = await vapidRes.json();
        if (cancelled) return;
        setConfigured(Boolean(vapid.configured && vapid.publicKey));

        if (!pushOk) return;
        const reg = await ensureServiceWorker();
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setEnabled(Boolean(sub));
      } catch {
        if (!cancelled) setConfigured(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    setError("");
    setHint("");
    try {
      if (!supported) {
        throw new Error("Push notifications are not supported on this browser");
      }

      const vapidRes = await fetch("/api/push/vapid");
      const vapid = await vapidRes.json();
      if (!vapid.configured || !vapid.publicKey) {
        throw new Error("Push is not set up on the server yet");
      }

      const reg = await ensureServiceWorker();
      await navigator.serviceWorker.ready;

      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") {
        throw new Error(
          "Notification permission was blocked. Enable it in phone settings for TSI INV."
        );
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
        });
      }

      const json = sub.toJSON();
      const saveRes = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      if (!saveRes.ok) throw new Error("Could not save this phone for alerts");

      setEnabled(true);
      const msg =
        "Phone alerts on. You’ll get a notification when stock is low or out.";
      setHint(msg);
      onStatus?.(msg);

      // Confirm with a local notification so they know permission worked
      if (reg.showNotification) {
        await reg.showNotification("TSI INV alerts on", {
          body: "You’ll be notified when materials are low or out of stock.",
          icon: "/icon-192.png",
          tag: "tsi-push-enabled",
          data: { url: "/" },
        });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not enable notifications";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError("");
    setHint("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEnabled(false);
      const msg = "Phone alerts turned off on this device.";
      setHint(msg);
      onStatus?.(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disable");
    } finally {
      setBusy(false);
    }
  }

  async function testRemotePush() {
    setBusy(true);
    setError("");
    setHint("");
    try {
      setHint(
        "Sending… lock your phone or switch apps now so you can hear the banner."
      );
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.reason || "Test push failed");
      }
      const msg = `Remote push sent to ${data.sent} phone(s). Check Notification Center if you missed the banner.`;
      setHint(msg);
      onStatus?.(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test push failed");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <div className="panel form-panel animate-rise" style={{ marginTop: 16 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>
          Phone push alerts
        </h2>
        <p className="hint">
          This browser can’t receive web push. On iPhone/iPad, add TSI INV to
          your Home Screen (Share → Add to Home Screen), open it from there,
          then come back to Settings.
        </p>
      </div>
    );
  }

  return (
    <div className="panel form-panel animate-rise" style={{ marginTop: 16 }}>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        Phone push alerts
      </h2>
      <p className="hint">
        Get a homescreen notification when materials hit low stock or run out.
        {!standalone
          ? " Best on a Home Screen app (Share → Add to Home Screen), especially on iPhone."
          : null}
      </p>
      <p className="hint">
        Tip: if the app is open, iPhone often only shows a badge (the red 1)
        and hides the banner/sound. Lock the phone or switch apps to hear the
        push. While you&apos;re in the app, TSI INV now also shows an on-screen
        alert and a local notification.
      </p>

      {!configured ? (
        <p className="form-error">
          Push isn’t configured on the server yet (VAPID keys missing).
        </p>
      ) : null}

      <p className="hint" style={{ marginBottom: 12 }}>
        Status:{" "}
        {enabled
          ? "this phone is subscribed"
          : permission === "denied"
            ? "blocked in browser settings"
            : "not enabled on this phone"}
      </p>

      {hint ? <p className="form-success">{hint}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <div className="form-actions">
        {enabled ? (
          <>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={testRemotePush}
            >
              {busy ? "Working..." : "Test push (leave app)"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={disable}
            >
              Turn off on this phone
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !configured || permission === "denied"}
            onClick={enable}
          >
            {busy ? "Working..." : "Enable phone alerts"}
          </button>
        )}
      </div>
    </div>
  );
}
