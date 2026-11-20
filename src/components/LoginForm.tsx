"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { homeForRole } from "@/lib/roles";
import type { PublicUser } from "@/lib/types";

type Step = "username" | "password" | "set-password";

function destFor(user: PublicUser, next: string | null) {
  const fallback = homeForRole(user.role);
  if (user.role === "crew") return fallback;
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return fallback;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<Step>("username");
  const [inviteName, setInviteName] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/login")
      .then((res) => res.json())
      .then((data: { needsSetup?: boolean; user?: PublicUser | null }) => {
        if (cancelled) return;
        if (data.user) {
          router.replace(destFor(data.user, searchParams.get("next")));
          return;
        }
        setNeedsSetup(Boolean(data.needsSetup));
        setChecking(false);
      })
      .catch(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          username,
          password,
          confirmPassword: step === "set-password" ? confirmPassword : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not sign in");

      if (data.user) {
        router.replace(destFor(data.user as PublicUser, searchParams.get("next")));
        router.refresh();
        return;
      }

      if (data.needsPassword) {
        setInviteName(String(data.name || ""));
        setStep("set-password");
        setPassword("");
        setConfirmPassword("");
        setBusy(false);
        return;
      }

      setStep("password");
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <div className="panel empty login-card">
        <h2>Opening TSI INV...</h2>
      </div>
    );
  }

  const heading = needsSetup
    ? "Create admin login"
    : step === "set-password"
      ? "Set your password"
      : "Sign in";

  const copy = needsSetup
    ? "This first login is an admin. After that you can add people with a username — they pick their password the first time they sign in."
    : step === "set-password"
      ? `Welcome${inviteName ? `, ${inviteName}` : ""}. Choose a password for this login (at least 6 characters). You’ll use it next time.`
      : step === "password"
        ? "Enter the password you set on your first sign-in."
        : "Enter the username your admin sent you.";

  return (
    <form className="panel form-panel login-card" onSubmit={submit}>
      <img src="/tsi-logo.png" alt="TSI" width={64} height={64} className="brand-logo" />
      <h1 className="page-title" style={{ marginTop: 12 }}>
        {heading}
      </h1>
      <p className="page-sub">{copy}</p>
      {needsSetup ? (
        <div className="field">
          <label htmlFor="name">Your name</label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Aaron"
            required
            autoComplete="name"
          />
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="username">Username</label>
        <input
          id="username"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            if (!needsSetup && step !== "username") {
              setStep("username");
              setPassword("");
              setConfirmPassword("");
            }
          }}
          placeholder="e.g. aaron"
          required
          autoComplete="username"
          autoCapitalize="none"
        />
      </div>
      {needsSetup || step === "password" || step === "set-password" ? (
        <div className="field">
          <label htmlFor="password">
            {step === "set-password" ? "New password" : "Password"}
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={
              needsSetup || step === "set-password" ? "new-password" : "current-password"
            }
          />
        </div>
      ) : null}
      {step === "set-password" ? (
        <div className="field">
          <label htmlFor="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy
          ? "Please wait..."
          : needsSetup
            ? "Create admin & sign in"
            : step === "set-password"
              ? "Save password & sign in"
              : step === "password"
                ? "Sign in"
                : "Continue"}
      </button>
    </form>
  );
}
