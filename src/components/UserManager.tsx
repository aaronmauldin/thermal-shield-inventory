"use client";

import { useEffect, useState } from "react";
import type { PublicUser, Truck, UserRole } from "@/lib/types";

function truckIdsFor(user: PublicUser): string[] {
  if (user.truckIds?.length) return user.truckIds;
  return user.truckId ? [user.truckId] : [];
}

function inviteText(user: PublicUser, trucks: Truck[]) {
  const names = truckIdsFor(user)
    .map((id) => trucks.find((entry) => entry.id === id)?.name)
    .filter(Boolean);
  const truckBit = names.length
    ? ` You’re assigned to ${names.join(", ")}.`
    : "";
  return `Your TSI INV username is ${user.username}.${truckBit} Open the app, enter that username, and set your own password the first time you sign in.`;
}

function truckLabel(user: PublicUser, trucks: Truck[]) {
  const names = truckIdsFor(user)
    .map((id) => trucks.find((truck) => truck.id === id)?.name || "truck");
  return names.length ? names.join(", ") : "no truck";
}

function TruckChecks({
  trucks,
  selected,
  onToggle,
  disabled,
}: {
  trucks: Truck[];
  selected: string[];
  onToggle: (id: string, checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="truck-check-list">
      {trucks.map((truck) => (
        <label key={truck.id} className="checkbox-row">
          <input
            type="checkbox"
            checked={selected.includes(truck.id)}
            disabled={disabled}
            onChange={(e) => onToggle(truck.id, e.target.checked)}
          />
          {truck.name}
        </label>
      ))}
    </div>
  );
}

export function UserManager() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [me, setMe] = useState<PublicUser | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<UserRole>("crew");
  const [truckIds, setTruckIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [usersRes, trucksRes] = await Promise.all([
      fetch("/api/users"),
      fetch("/api/trucks"),
    ]);
    const data = await usersRes.json();
    if (!usersRes.ok) throw new Error(data.error || "Could not load logins");
    const nextTrucks = trucksRes.ok ? ((await trucksRes.json()) as Truck[]) : [];
    setUsers(data.users || []);
    setMe(data.me || null);
    setTrucks(nextTrucks);
  }

  useEffect(() => {
    load().catch((err) => {
      setError(err instanceof Error ? err.message : "Could not load logins");
    });
  }, []);

  async function copyInvite(user: PublicUser) {
    const text = inviteText(user, trucks);
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`Copied a message you can send to ${user.name}.`);
      setError("");
    } catch {
      setError("Could not copy — long-press the username and send it yourself.");
    }
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          username,
          role,
          truckIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create login");
      setUsers((prev) =>
        [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
      );
      setName("");
      setUsername("");
      setRole("crew");
      setTruckIds([]);
      const created = data as PublicUser;
      setMessage(
        `Created “${created.username}” on ${truckLabel(created, trucks)}. Send them that username.`
      );
      await copyInvite(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create login");
    } finally {
      setBusy(false);
    }
  }

  async function changeTrucks(user: PublicUser, nextIds: string[]) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, truckIds: nextIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not assign trucks");
      setUsers((prev) =>
        prev.map((entry) => (entry.id === user.id ? data : entry))
      );
      setMessage(`Assigned ${user.name} to ${truckLabel(data, trucks)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign trucks");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(user: PublicUser) {
    if (
      !confirm(
        `Reset password for “${user.username}”? They will set a new one the next time they sign in.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, resetPassword: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not reset password");
      setUsers((prev) =>
        prev.map((entry) => (entry.id === user.id ? data : entry))
      );
      setMessage(`Password reset for “${user.username}”. Send them their username again.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(user: PublicUser) {
    if (!confirm(`Delete login “${user.username}”?`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete login");
      setUsers((prev) => prev.filter((entry) => entry.id !== user.id));
      setMessage(`Deleted “${user.username}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete login");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="animate-rise" style={{ marginTop: 22 }}>
      <h2 className="section-title">Logins</h2>
      <p className="page-sub">
        Add a name, username, and one or more trucks, then send them the
        username. They choose their password the first time they sign in. Crew
        only see the trucks you assign.
      </p>

      <form className="panel form-panel" onSubmit={addUser}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="login-name">Name</label>
            <input
              id="login-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="login-username">Username</label>
            <input
              id="login-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoCapitalize="none"
            />
          </div>
          <div className="field">
            <label htmlFor="login-role">Role</label>
            <select
              id="login-role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              <option value="crew">Crew — checkout & trucks</option>
              <option value="admin">Admin — everything</option>
            </select>
          </div>
          <div className="field">
            <label>Assigned trucks</label>
            {trucks.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>
                Add a truck first, then you can assign people to it.
              </p>
            ) : (
              <TruckChecks
                trucks={trucks}
                selected={truckIds}
                onToggle={(id, checked) =>
                  setTruckIds((prev) =>
                    checked ? [...prev, id] : prev.filter((entry) => entry !== id)
                  )
                }
              />
            )}
          </div>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="form-success">{message}</p> : null}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || (role === "crew" && truckIds.length === 0)}
        >
          {role === "admin" ? "Add admin login" : "Add crew login"}
        </button>
      </form>

      <div className="item-list" style={{ marginTop: 14 }}>
        {users.map((user) => (
          <article key={user.id} className="panel item-row">
            <div className="item-main">
              <strong>{user.name}</strong>
              <span className="hint" style={{ margin: 0 }}>
                {user.username} · {user.role === "admin" ? "Admin" : "Crew"} ·{" "}
                {truckLabel(user, trucks)}
                {user.mustSetPassword ? " · waiting to set password" : ""}
              </span>
              {me?.id === user.id ? (
                <span className="hint" style={{ margin: 0 }}>
                  You
                </span>
              ) : trucks.length > 0 ? (
                <div style={{ marginTop: 8 }}>
                  <span className="hint" style={{ margin: 0 }}>
                    Trucks
                  </span>
                  <TruckChecks
                    trucks={trucks}
                    selected={truckIdsFor(user)}
                    disabled={busy}
                    onToggle={(id, checked) => {
                      const current = truckIdsFor(user);
                      const next = checked
                        ? [...current, id]
                        : current.filter((entry) => entry !== id);
                      void changeTrucks(user, next);
                    }}
                  />
                </div>
              ) : null}
            </div>
            {me?.id === user.id ? null : (
              <div className="login-row-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => void copyInvite(user)}
                >
                  Copy invite
                </button>
                {user.mustSetPassword ? null : (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => void resetPassword(user)}
                  >
                    Reset password
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => void removeUser(user)}
                >
                  Delete
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
