import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { loadAuthRaw, saveAuthRaw } from "./storage";
import { homeForRole } from "./roles";
import type {
  AppUser,
  AuthSession,
  AuthStore,
  PublicUser,
  UserRole,
} from "./types";

export type { PublicUser, UserRole };

const SESSION_COOKIE = "tsi_session";
const SESSION_DAYS = 30;
/** Cloudflare Workers reject PBKDF2 iteration counts above 100000. */
const PBKDF2_ITERATIONS = 100_000;

function nowIso() {
  return new Date().toISOString();
}

export function assignedTruckIds(user: {
  truckId?: string | null;
  truckIds?: string[] | null;
}): string[] {
  const ids = [
    ...(Array.isArray(user.truckIds) ? user.truckIds : []),
    user.truckId || "",
  ]
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

function toPublic(user: AppUser): PublicUser {
  const truckIds = assignedTruckIds(user);
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    mustSetPassword: needsSetPassword(user),
    truckIds,
    truckId: truckIds[0] || null,
  };
}

function storedIterations(hash: string): number | null {
  const parts = hash.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return null;
  const iterations = Number(parts[1]);
  return Number.isFinite(iterations) ? iterations : null;
}

function needsSetPassword(user: AppUser) {
  if (user.mustSetPassword === true || !user.passwordHash) return true;
  const iterations = storedIterations(user.passwordHash);
  // Cloudflare Workers cannot verify PBKDF2 above 100k; those hashes must be replaced.
  return iterations === null || iterations > PBKDF2_ITERATIONS;
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

async function readStore(): Promise<AuthStore> {
  const raw = await loadAuthRaw();
  if (!raw) return { users: [], sessions: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<AuthStore>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return { users: [], sessions: [] };
  }
}

async function writeStore(store: AuthStore): Promise<void> {
  const stamped = Date.now();
  store.sessions = store.sessions.filter(
    (session) => new Date(session.expiresAt).getTime() > stamped
  );
  await saveAuthRaw(JSON.stringify(store));
}

function bytesToB64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function b64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    key,
    256
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToB64(salt)}$${bytesToB64(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1 || iterations > 100_000) {
    return false;
  }
  const salt = b64ToBytes(parts[2]);
  const expected = b64ToBytes(parts[3]);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  try {
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      key,
      expected.length * 8
    );
    const actual = new Uint8Array(bits);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

export async function userCount(): Promise<number> {
  const store = await readStore();
  return store.users.length;
}

export async function listPublicUsers(): Promise<PublicUser[]> {
  const store = await readStore();
  return store.users
    .map(toPublic)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createUser(input: {
  name: string;
  username: string;
  password?: string;
  role: UserRole;
  truckId?: string | null;
  truckIds?: string[] | null;
}): Promise<PublicUser> {
  const name = input.name.trim();
  const username = normalizeUsername(input.username);
  const password = input.password?.trim() || "";
  const truckIds = assignedTruckIds({
    truckId: input.truckId,
    truckIds: input.truckIds,
  });
  if (!name) throw new Error("Name is required");
  if (username.length < 3) throw new Error("Username must be at least 3 characters");
  if (password && password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }
  if (input.role !== "admin" && input.role !== "crew") {
    throw new Error("Role must be admin or crew");
  }
  if (input.role === "crew" && truckIds.length === 0) {
    throw new Error("Assign at least one truck");
  }

  const store = await readStore();
  if (store.users.some((user) => user.username === username)) {
    throw new Error("That username is already taken");
  }

  const user: AppUser = {
    id: randomUUID(),
    name,
    username,
    passwordHash: password ? await hashPassword(password) : "",
    role: input.role,
    mustSetPassword: !password,
    truckIds,
    truckId: truckIds[0] || null,
    createdAt: nowIso(),
  };
  store.users.push(user);
  await writeStore(store);
  return toPublic(user);
}

export async function deleteUser(id: string, actorId: string): Promise<boolean> {
  const store = await readStore();
  const target = store.users.find((user) => user.id === id);
  if (!target) return false;
  if (target.id === actorId) throw new Error("You cannot delete your own login");
  const admins = store.users.filter((user) => user.role === "admin");
  if (target.role === "admin" && admins.length <= 1) {
    throw new Error("Keep at least one admin login");
  }
  store.users = store.users.filter((user) => user.id !== id);
  store.sessions = store.sessions.filter((session) => session.userId !== id);
  await writeStore(store);
  return true;
}

export async function updateUserTruck(
  id: string,
  truckId: string | null,
  role?: UserRole
): Promise<PublicUser | null> {
  return updateUserTrucks(id, truckId ? [truckId] : [], role);
}

export async function updateUserTrucks(
  id: string,
  truckIds: string[],
  role?: UserRole
): Promise<PublicUser | null> {
  const store = await readStore();
  const user = store.users.find((entry) => entry.id === id);
  if (!user) return null;
  const nextRole = role ?? user.role;
  const nextIds = assignedTruckIds({ truckIds });
  if (nextRole === "crew" && nextIds.length === 0) {
    throw new Error("Assign at least one truck");
  }
  user.role = nextRole;
  user.truckIds = nextIds;
  user.truckId = nextIds[0] || null;
  await writeStore(store);
  return toPublic(user);
}

export async function clearTruckAssignments(truckId: string): Promise<void> {
  const store = await readStore();
  let changed = false;
  for (const user of store.users) {
    const nextIds = assignedTruckIds(user).filter((id) => id !== truckId);
    if (
      nextIds.join("|") !== assignedTruckIds(user).join("|") ||
      user.truckId === truckId
    ) {
      user.truckIds = nextIds;
      user.truckId = nextIds[0] || null;
      changed = true;
    }
  }
  if (changed) await writeStore(store);
}

export async function resetUserPassword(id: string): Promise<PublicUser | null> {
  const store = await readStore();
  const user = store.users.find((entry) => entry.id === id);
  if (!user) return null;
  user.passwordHash = "";
  user.mustSetPassword = true;
  store.sessions = store.sessions.filter((session) => session.userId !== id);
  await writeStore(store);
  return toPublic(user);
}

async function attachSession(
  store: AuthStore,
  user: AppUser,
  options?: { secure?: boolean }
) {
  const session: AuthSession = {
    id: randomUUID(),
    userId: user.id,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };
  store.sessions.push(session);
  await writeStore(store);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: options?.secure ?? process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export type LoginAttempt =
  | { status: "ok"; user: PublicUser }
  | { status: "needs-password"; name: string }
  | { status: "needs-existing-password" };

export async function login(
  username: string,
  password: string,
  options?: { secure?: boolean; confirmPassword?: string }
): Promise<LoginAttempt> {
  const store = await readStore();
  const user = store.users.find(
    (entry) => entry.username === normalizeUsername(username)
  );
  if (!user) {
    throw new Error("Wrong username or password");
  }

  if (needsSetPassword(user)) {
    if (!password) {
      return { status: "needs-password", name: user.name };
    }
    if (password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }
    if (
      options?.confirmPassword !== undefined &&
      password !== options.confirmPassword
    ) {
      throw new Error("Passwords do not match");
    }
    user.passwordHash = await hashPassword(password);
    user.mustSetPassword = false;
    await attachSession(store, user, options);
    return { status: "ok", user: toPublic(user) };
  }

  if (!password) {
    return { status: "needs-existing-password" };
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Wrong username or password");
  }

  await attachSession(store, user, options);
  return { status: "ok", user: toPublic(user) };
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const store = await readStore();
    store.sessions = store.sessions.filter((session) => session.id !== token);
    await writeStore(store);
  }
  jar.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<PublicUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const store = await readStore();
  const session = store.sessions.find((entry) => entry.id === token);
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    return null;
  }
  const user = store.users.find((entry) => entry.id === session.userId);
  return user ? toPublic(user) : null;
}

export { homeForRole };
