import { createHash, randomBytes } from "crypto";
import { assignedTruckIds, listPublicUsers } from "./auth";
import {
  getJobberConnection,
  listItems,
  listLineItemTemplates,
  listTrucks,
  setJobberConnection,
  upsertJobberTruckJobs,
} from "./db";
import {
  addDaysYmd,
  formatYmdInZone,
  normalizePersonName,
  todayYmd,
} from "./jobSort";
import {
  loadJobberJobsCacheRaw,
  saveJobberJobsCacheRaw,
} from "./storage";
import {
  normalizeLineName,
  type InventoryItem,
  type JobberConnection,
  type LineItemTemplate,
  type LineItemTemplateMaterial,
} from "./types";

const JOBBER_AUTH = "https://api.getjobber.com/api/oauth/authorize";
const JOBBER_TOKEN = "https://api.getjobber.com/api/oauth/token";
const JOBBER_GRAPHQL = "https://api.getjobber.com/api/graphql";
const JOBBER_VERSION = "2025-04-16";

export type JobberLineItem = {
  id: string;
  name: string;
  quantity: number;
  description: string;
};

export type JobberJob = {
  id: string;
  jobNumber: number | null;
  title: string;
  jobStatus: string;
  startAt: string | null;
  address: string;
  assignedNames?: string[];
  lineItems: JobberLineItem[];
};

export type EstimatedMaterial = LineItemTemplateMaterial & {
  stockOnHand: number;
  shortfall: number;
};

export type EstimatedJob = {
  id: string;
  jobNumber: number | null;
  title: string;
  jobStatus: string;
  startAt: string | null;
  address: string;
  lineItems: Array<{
    id: string;
    name: string;
    quantity: number;
    matched: boolean;
    templateId: string | null;
    templateName: string | null;
    materials: EstimatedMaterial[];
  }>;
  materials: EstimatedMaterial[];
  unmatchedNames: string[];
  scanned?: number;
};

type JobberEnvKey =
  | "JOBBER_CLIENT_ID"
  | "JOBBER_CLIENT_SECRET"
  | "JOBBER_REDIRECT_URI";

/** Worker secrets live on Cloudflare `env`, not always on `process.env`. */
async function readJobberEnv(key: JobberEnvKey): Promise<string> {
  const fromProcess = String(process.env[key] || "").trim();
  if (fromProcess) return fromProcess;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = await Promise.race([
      getCloudflareContext({ async: true }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    if (!ctx) return "";
    const value = (ctx.env as unknown as Record<string, unknown>)[key];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

async function clientId() {
  return readJobberEnv("JOBBER_CLIENT_ID");
}

async function clientSecret() {
  return readJobberEnv("JOBBER_CLIENT_SECRET");
}

export async function jobberConfigured(): Promise<boolean> {
  const [id, secret] = await Promise.all([clientId(), clientSecret()]);
  return Boolean(id && secret);
}

export async function jobberRedirectUri(requestOrigin: string): Promise<string> {
  const fromEnv = await readJobberEnv("JOBBER_REDIRECT_URI");
  if (fromEnv) return fromEnv;
  return `${requestOrigin.replace(/\/$/, "")}/api/jobber/callback`;
}

export function createPkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("hex");
  return { verifier, challenge, state };
}

export async function buildAuthorizeUrl(input: {
  redirectUri: string;
  state: string;
  challenge: string;
}) {
  const url = new URL(JOBBER_AUTH);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", await clientId());
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function exchangeToken(body: Record<string, string>) {
  const [id, secret] = await Promise.all([clientId(), clientSecret()]);
  const res = await fetch(JOBBER_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      ...body,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || "Jobber token exchange failed"
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || "",
    expiresIn: Number(data.expires_in) || 3600,
  };
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<JobberConnection> {
  const tokens = await exchangeToken({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
  });
  const account = await graphql<{ account: { id: string; name: string } }>(
    tokens.accessToken,
    `query { account { id name } }`
  );
  const stamped = new Date().toISOString();
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
    accountId: account.account?.id || "",
    accountName: account.account?.name || "Jobber account",
    connectedAt: stamped,
  };
}

async function refreshAccessToken(
  connection: JobberConnection
): Promise<JobberConnection> {
  if (!connection.refreshToken) {
    throw new Error("Jobber reconnect required — missing refresh token");
  }
  const tokens = await exchangeToken({
    grant_type: "refresh_token",
    refresh_token: connection.refreshToken,
  });
  const next: JobberConnection = {
    ...connection,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || connection.refreshToken,
    expiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
  };
  await setJobberConnection(next);
  return next;
}

async function getValidConnection(): Promise<JobberConnection> {
  const connection = await getJobberConnection();
  if (!connection) throw new Error("Jobber is not connected");
  const expiresAt = new Date(connection.expiresAt).getTime();
  // Refresh 2 minutes early
  if (Number.isFinite(expiresAt) && expiresAt - Date.now() > 2 * 60 * 1000) {
    return connection;
  }
  return refreshAccessToken(connection);
}

type GraphqlResult<T> =
  | { ok: true; data: T; usersHidden?: boolean }
  | { ok: false; error: string };

function isHiddenUserPermissionError(message: string): boolean {
  return /type User was hidden due to permissions/i.test(message);
}

export const JOBBER_USERS_SCOPE_MESSAGE =
  "Jobber is still hiding Team names, so this connection does not have Users access yet. After Users read is saved in the Developer Center, open Upcoming material → Disconnect, then Connect Jobber. On Jobber’s Allow Access screen you must see Users. If that screen does not appear, remove this app in Jobber (App Marketplace / connected apps) and Connect again as a Jobber admin.";

function friendlyJobberError(message: string): string {
  if (isHiddenUserPermissionError(message)) return JOBBER_USERS_SCOPE_MESSAGE;
  return message;
}

async function graphqlRequest<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
  options?: { allowPartial?: boolean }
): Promise<GraphqlResult<T>> {
  let lastError = "Jobber API error";
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let res: Response;
    try {
      res = await fetch(JOBBER_GRAPHQL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-JOBBER-GRAPHQL-VERSION": JOBBER_VERSION,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      lastError =
        err instanceof Error && err.name === "AbortError"
          ? "Jobber timed out"
          : "Jobber API error";
      continue;
    }
    clearTimeout(timer);
    const payload = (await res.json().catch(() => ({}))) as {
      data?: T;
      errors?: { message: string }[];
    };
    const allErrors = payload.errors || [];
    const usersHidden = allErrors.some((error) =>
      isHiddenUserPermissionError(error.message)
    );
    const blocking = allErrors.filter(
      (error) => !isHiddenUserPermissionError(error.message)
    );
    const msg =
      blocking.map((e) => e.message).join("; ") ||
      (usersHidden
        ? JOBBER_USERS_SCOPE_MESSAGE
        : `Jobber API error (${res.status})`);

    if (res.status === 401) {
      return { ok: false, error: "Jobber token expired — reconnect Jobber" };
    }

    const throttled =
      res.status === 429 ||
      /throttl/i.test(msg) ||
      blocking.some((e) => /throttl/i.test(e.message));

    if (throttled) {
      lastError = "Throttled";
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }

    if (
      !res.ok ||
      (blocking.length && !payload.data) ||
      (blocking.length && options?.allowPartial === false)
    ) {
      return { ok: false, error: friendlyJobberError(msg) };
    }
    if (!payload.data) {
      return {
        ok: false,
        error: usersHidden
          ? JOBBER_USERS_SCOPE_MESSAGE
          : "Empty Jobber response",
      };
    }
    return { ok: true, data: payload.data, usersHidden };
  }
  return { ok: false, error: lastError };
}

async function graphql<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const result = await graphqlRequest<T>(accessToken, query, variables);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

function formatAddress(property: unknown): string {
  if (!property || typeof property !== "object") return "";
  const addr = (property as { address?: Record<string, unknown> }).address;
  if (!addr || typeof addr !== "object") return "";
  const parts = [
    addr.street1,
    addr.street,
    addr.street2,
    addr.city,
    addr.province,
    addr.pc,
    addr.postalCode,
  ]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean);
  return [...new Set(parts)].join(", ");
}

export type JobDateRange = {
  from: string; // YYYY-MM-DD local
  to: string; // YYYY-MM-DD local
  includeUndated?: boolean;
};

function startOfLocalDay(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function endOfLocalDay(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

function jobInDateRange(job: JobberJob, range: JobDateRange): boolean {
  if (!job.startAt) return Boolean(range.includeUndated);
  const t = new Date(job.startAt).getTime();
  if (!Number.isFinite(t)) return Boolean(range.includeUndated);
  return t >= startOfLocalDay(range.from) && t <= endOfLocalDay(range.to);
}

export type JobFetchMeta = {
  scanned: number;
  matched: number;
  pages: number;
  truncated: boolean;
  fromCache: boolean;
  cacheAgeMinutes: number | null;
};

type JobberJobsCache = {
  accountId: string;
  fetchedAt: string;
  jobs: JobberJob[];
  pages: number;
  truncated: boolean;
};

const JOBBER_CACHE_TTL_MS = 15 * 60 * 1000;

async function readJobsCache(
  accountId: string
): Promise<JobberJobsCache | null> {
  try {
    const raw = await loadJobberJobsCacheRaw();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as JobberJobsCache;
    if (!parsed?.accountId || parsed.accountId !== accountId) return null;
    if (!Array.isArray(parsed.jobs) || !parsed.fetchedAt) return null;
    const age = Date.now() - new Date(parsed.fetchedAt).getTime();
    if (!Number.isFinite(age) || age < 0 || age > JOBBER_CACHE_TTL_MS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeJobsCache(cache: JobberJobsCache): Promise<void> {
  await saveJobberJobsCacheRaw(JSON.stringify(cache));
}

type JobberJobNode = {
  id: string;
  jobNumber?: number | null;
  title?: string | null;
  jobStatus?: string | null;
  startAt?: string | null;
  property?: unknown;
  lineItems?: {
    nodes: Array<{
      id: string;
      name?: string | null;
      quantity?: number | null;
      description?: string | null;
    }>;
  };
};

function mapJobNode(node: JobberJobNode): JobberJob {
  return {
    id: node.id,
    jobNumber: node.jobNumber ?? null,
    title: node.title || `Job #${node.jobNumber ?? ""}`.trim(),
    jobStatus: String(node.jobStatus || ""),
    startAt: node.startAt || null,
    address: formatAddress(node.property),
    lineItems: (node.lineItems?.nodes || [])
      .map((li) => ({
        id: li.id,
        name: String(li.name || "").trim(),
        quantity: Number(li.quantity) || 0,
        description: String(li.description || ""),
      }))
      .filter((li) => li.name && li.quantity > 0),
  };
}

export async function fetchUpcomingJobs(
  range?: JobDateRange,
  options?: { force?: boolean }
): Promise<{
  accountName: string;
  jobs: JobberJob[];
  meta: JobFetchMeta;
}> {
  const connection = await getValidConnection();

  // Cloudflare Workers limit subrequests per invocation. Keep Jobber calls low
  // and reuse a short-lived cache when changing date ranges.
  const pageSize = 50;
  const maxPages = 6; // max ~300 jobs / ~6 Jobber HTTP calls
  let after: string | null = null;
  let pages = 0;
  let truncated = false;
  let fromCache = false;
  let cacheAgeMinutes: number | null = null;
  let scanned: JobberJob[] = [];

  if (!options?.force) {
    const cached = await readJobsCache(connection.accountId);
    if (cached) {
      scanned = cached.jobs;
      pages = cached.pages;
      truncated = cached.truncated;
      fromCache = true;
      cacheAgeMinutes = Math.max(
        0,
        Math.round(
          (Date.now() - new Date(cached.fetchedAt).getTime()) / 60000
        )
      );
    }
  }

  if (!fromCache) {
    const query = `query UpcomingJobs($first: Int!, $after: String) {
      jobs(first: $first, after: $after) {
        nodes {
          id
          jobNumber
          title
          jobStatus
          startAt
          property {
            address {
              street1
              street2
              city
              province
              postalCode
            }
          }
          lineItems(first: 40) {
            nodes {
              id
              name
              quantity
              description
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }`;

    type JobsPage = {
      jobs: {
        nodes: JobberJobNode[];
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      };
    };

    while (pages < maxPages) {
      const data: JobsPage = await graphql<JobsPage>(
        connection.accessToken,
        query,
        {
          first: pageSize,
          after,
        }
      );

      pages += 1;
      const nodes: JobberJobNode[] = data.jobs?.nodes || [];
      for (const node of nodes) {
        const job = mapJobNode(node);
        if (job.jobStatus.toLowerCase() === "archived") continue;
        scanned.push(job);
      }

      const pageInfo: { hasNextPage?: boolean; endCursor?: string | null } =
        data.jobs?.pageInfo || {};
      if (!pageInfo.hasNextPage || !pageInfo.endCursor) break;
      after = pageInfo.endCursor;
    }

    if (pages >= maxPages) truncated = true;

    await writeJobsCache({
      accountId: connection.accountId,
      fetchedAt: new Date().toISOString(),
      jobs: scanned,
      pages,
      truncated,
    });
  }

  let jobs = scanned;
  if (range?.from && range?.to) {
    jobs = scanned.filter((job) => jobInDateRange(job, range));
  }

  jobs.sort((a, b) => {
    const at = a.startAt ? new Date(a.startAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bt = b.startAt ? new Date(b.startAt).getTime() : Number.MAX_SAFE_INTEGER;
    return at - bt;
  });

  return {
    accountName: connection.accountName,
    jobs,
    meta: {
      scanned: scanned.length,
      matched: jobs.length,
      pages,
      truncated,
      fromCache,
      cacheAgeMinutes,
    },
  };
}

function materialNeeded(
  material: LineItemTemplateMaterial,
  lineQty: number
): number {
  if (material.calcMode === "sqft_coverage") {
    const coverage = Number(material.coverageSqft);
    if (!Number.isFinite(coverage) || coverage <= 0) return 0;
    // Jobber line quantity is treated as square feet
    return Math.ceil(lineQty / coverage);
  }
  const perLine = Number(material.quantity);
  if (!Number.isFinite(perLine) || perLine <= 0) return 0;
  return Math.round(perLine * lineQty * 1000) / 1000;
}

function scaleMaterials(
  materials: LineItemTemplateMaterial[],
  lineQty: number,
  stockById: Map<string, InventoryItem>
): EstimatedMaterial[] {
  return materials.map((m) => {
    const needed = materialNeeded(m, lineQty);
    const onHand = stockById.get(m.itemId)?.quantity ?? 0;
    return {
      ...m,
      quantity: needed,
      stockOnHand: onHand,
      shortfall: Math.max(0, needed - onHand),
    };
  });
}

function mergeMaterials(list: EstimatedMaterial[]): EstimatedMaterial[] {
  const map = new Map<string, EstimatedMaterial>();
  for (const row of list) {
    const cur = map.get(row.itemId);
    if (!cur) {
      map.set(row.itemId, { ...row });
      continue;
    }
    cur.quantity = Math.round((cur.quantity + row.quantity) * 1000) / 1000;
    cur.shortfall = Math.max(0, cur.quantity - cur.stockOnHand);
  }
  return [...map.values()].sort((a, b) => a.itemName.localeCompare(b.itemName));
}

export function estimateJobsFromTemplates(
  jobs: JobberJob[],
  templates: LineItemTemplate[],
  items: InventoryItem[]
): EstimatedJob[] {
  const byName = new Map(
    templates.map((t) => [normalizeLineName(t.name), t] as const)
  );
  const stockById = new Map(items.map((i) => [i.id, i]));

  return jobs.map((job) => {
    const lineEstimates = job.lineItems.map((li) => {
      const template = byName.get(normalizeLineName(li.name));
      if (!template) {
        return {
          id: li.id,
          name: li.name,
          quantity: li.quantity,
          matched: false,
          templateId: null,
          templateName: null,
          materials: [] as EstimatedMaterial[],
        };
      }
      return {
        id: li.id,
        name: li.name,
        quantity: li.quantity,
        matched: true,
        templateId: template.id,
        templateName: template.name,
        materials: scaleMaterials(template.materials, li.quantity, stockById),
      };
    });

    const materials = mergeMaterials(
      lineEstimates.flatMap((li) => li.materials)
    );
    const unmatchedNames = [
      ...new Set(lineEstimates.filter((li) => !li.matched).map((li) => li.name)),
    ];

    return {
      id: job.id,
      jobNumber: job.jobNumber,
      title: job.title,
      jobStatus: job.jobStatus,
      startAt: job.startAt,
      address: job.address,
      lineItems: lineEstimates,
      materials,
      unmatchedNames,
    };
  });
}

export async function buildJobberEstimates(
  range?: JobDateRange,
  options?: { force?: boolean }
): Promise<{
  connected: boolean;
  configured: boolean;
  accountName: string;
  jobs: EstimatedJob[];
  totals: EstimatedMaterial[];
  templatesCount: number;
  range: { from: string; to: string; includeUndated: boolean } | null;
  meta: JobFetchMeta;
}> {
  const configured = await jobberConfigured();
  const templates = await listLineItemTemplates();
  const items = await listItems();
  const connection = await getJobberConnection();
  const resolvedRange = range
    ? {
        from: range.from,
        to: range.to,
        includeUndated: Boolean(range.includeUndated),
      }
    : null;
  const emptyMeta: JobFetchMeta = {
    scanned: 0,
    matched: 0,
    pages: 0,
    truncated: false,
    fromCache: false,
    cacheAgeMinutes: null,
  };

  if (!configured || !connection) {
    return {
      connected: Boolean(connection),
      configured,
      accountName: connection?.accountName || "",
      jobs: [],
      totals: [],
      templatesCount: templates.length,
      range: resolvedRange,
      meta: emptyMeta,
    };
  }

  const { accountName, jobs, meta } = await fetchUpcomingJobs(
    resolvedRange || undefined,
    options
  );
  const estimated = estimateJobsFromTemplates(jobs, templates, items);
  const totals = mergeMaterials(estimated.flatMap((j) => j.materials));

  return {
    connected: true,
    configured,
    accountName,
    jobs: estimated,
    totals,
    templatesCount: templates.length,
    range: resolvedRange,
    meta,
  };
}

type JobberName = string | { full?: string | null; first?: string | null; last?: string | null } | null;

type AssignedUserNode = {
  id?: string | null;
  name?: JobberName;
  email?: JobberName | { raw?: string | null } | null;
  emails?: Array<{ address?: string | null } | string> | null;
};

type UserConnection = {
  nodes?: AssignedUserNode[] | null;
  edges?: Array<{ node?: AssignedUserNode | null } | null> | null;
};

function emailLocalPart(value: unknown): string {
  let email = "";
  if (typeof value === "string") email = value;
  else if (value && typeof value === "object") {
    const row = value as { raw?: string; address?: string };
    email = String(row.raw || row.address || "");
  }
  return email.trim().split("@")[0] || "";
}

function statusText(status: unknown): string {
  if (!status) return "";
  if (typeof status === "string") return status;
  if (typeof status === "object") {
    const row = status as { name?: string; status?: string; value?: string };
    return String(row.name || row.status || row.value || "");
  }
  return String(status);
}

type VisitLike = {
  id?: string;
  title?: string | null;
  startAt?: string | null;
  visitStatus?: unknown;
  job?: {
    id?: string;
    jobNumber?: number | null;
    title?: string | null;
    jobStatus?: string | null;
    assignedUsers?: UserConnection | null;
  } | null;
  property?: unknown;
  assignedUsers?: UserConnection | null;
};

type JobLike = {
  id: string;
  jobNumber?: number | null;
  title?: string | null;
  jobStatus?: string | null;
  startAt?: string | null;
  property?: unknown;
  salesperson?: { name?: JobberName } | null;
  assignedUsers?: UserConnection | null;
  visits?: { nodes?: VisitLike[] | null } | null;
};

const VISIT_ASSIGNED_USERS = `assignedUsers(first: 25) {
        nodes {
          id
          name { full }
        }
      }`;

const SCHEDULED_ITEMS_QUERY = `query SyncSchedule($first: Int!, $after: String, $startAfter: ISO8601DateTime!, $startBefore: ISO8601DateTime!) {
  scheduledItems(
    first: $first
    after: $after
    filter: {
      startsBetween: { from: $startAfter, to: $startBefore }
      scheduledItemType: [VISIT]
      schedulingAspect: ALL
    }
  ) {
    nodes {
      id
      title
      startAt
      ${VISIT_ASSIGNED_USERS}
      ... on Visit {
        visitStatus(timezone: "America/New_York")
        job { id jobNumber title jobStatus }
        property {
          address { street1 street2 city province postalCode }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const SCHEDULED_ITEMS_SIMPLE_QUERY = `query SyncSchedule($first: Int!, $after: String, $startAfter: ISO8601DateTime!, $startBefore: ISO8601DateTime!) {
  scheduledItems(
    first: $first
    after: $after
    filter: { startsBetween: { from: $startAfter, to: $startBefore } }
  ) {
    nodes {
      id
      title
      startAt
      ${VISIT_ASSIGNED_USERS}
      ... on Visit {
        job { id jobNumber title jobStatus }
        property {
          address { street1 street2 city province postalCode }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const VISITS_STARTDATE_QUERY = `query SyncVisits($first: Int!, $after: String, $startAfter: ISO8601DateTime!, $startBefore: ISO8601DateTime!) {
  visits(
    first: $first
    after: $after
    filter: { startDate: { from: $startAfter, to: $startBefore } }
  ) {
    nodes {
      id
      title
      startAt
      visitStatus(timezone: "America/New_York")
      job { id jobNumber title jobStatus }
      property {
        address { street1 street2 city province postalCode }
      }
      ${VISIT_ASSIGNED_USERS}
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const VISITS_FILTERED_QUERY = `query SyncVisits($first: Int!, $after: String, $startAfter: ISO8601DateTime!, $startBefore: ISO8601DateTime!) {
  visits(
    first: $first
    after: $after
    filter: { startAt: { after: $startAfter, before: $startBefore } }
  ) {
    nodes {
      id
      title
      startAt
      visitStatus(timezone: "America/New_York")
      job { id jobNumber title jobStatus }
      property {
        address { street1 street2 city province postalCode }
      }
      ${VISIT_ASSIGNED_USERS}
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const VISITS_CALENDAR_QUERY = `query SyncVisits($first: Int!, $after: String) {
  visits(first: $first, after: $after) {
    nodes {
      id
      title
      startAt
      visitStatus(timezone: "America/New_York")
      job { id jobNumber title jobStatus }
      property {
        address { street1 street2 city province postalCode }
      }
      ${VISIT_ASSIGNED_USERS}
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const VISITS_CALENDAR_SORTED_QUERY = `query SyncVisits($first: Int!, $after: String) {
  visits(
    first: $first
    after: $after
    sort: [{ key: START_AT, direction: DESCENDING }]
  ) {
    nodes {
      id
      title
      startAt
      visitStatus(timezone: "America/New_York")
      job { id jobNumber title jobStatus }
      property {
        address { street1 street2 city province postalCode }
      }
      ${VISIT_ASSIGNED_USERS}
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const VISITS_CALENDAR_SIMPLE_QUERY = `query SyncVisits($first: Int!, $after: String) {
  visits(first: $first, after: $after) {
    nodes {
      id
      title
      startAt
      job { id jobNumber title jobStatus }
      property {
        address { street1 street2 city province postalCode }
      }
      assignedUsers(first: 25) {
        nodes { id name { full } }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

function personName(name: JobberName | undefined): string {
  if (!name) return "";
  if (typeof name === "string") return name.trim();
  const full = String(name.full || "").trim();
  if (full) return full;
  return [name.first, name.last]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const key = normalizePersonName(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function connectionUsers(connection?: UserConnection | null): AssignedUserNode[] {
  const fromNodes = connection?.nodes || [];
  const fromEdges = (connection?.edges || [])
    .map((edge) => edge?.node)
    .filter((node): node is AssignedUserNode => Boolean(node));
  return [...fromNodes, ...fromEdges];
}

function namesFromUsers(
  connection?: UserConnection | null,
  peopleById?: Map<string, string>
): string[] {
  const names: string[] = [];
  for (const node of connectionUsers(connection)) {
    names.push(personName(node?.name));
    names.push(emailLocalPart(node?.email));
    const id = String(node?.id || "");
    if (id && peopleById?.has(id)) names.push(peopleById.get(id) || "");
    for (const extra of node?.emails || []) {
      names.push(emailLocalPart(extra));
    }
  }
  return uniqueNames(names);
}

function isDroppedStatus(status: unknown): boolean {
  const value = statusText(status).toLowerCase();
  if (!value) return false;
  // Jobber marks many dated calendar visits as UNSCHEDULED unless visitStatus
  // is requested with a timezone. Those still have startAt and must sync.
  if (value.includes("unscheduled")) return false;
  return /cancel|deleted|archiv/.test(value);
}

type ScheduleRow = {
  jobberJobId: string;
  jobberVisitId: string | null;
  scheduledAt: string | null;
  name: string;
  location: string;
  assignedNames: string[];
  cancelled: boolean;
};

function jobDisplayName(jobNumber: number | null | undefined, title: string): string {
  const label = title.trim();
  if (jobNumber && label && !label.includes(String(jobNumber))) {
    return `#${jobNumber} ${label}`;
  }
  return label || (jobNumber ? `Job #${jobNumber}` : "Jobber job");
}

function rowFromVisit(
  visit: VisitLike,
  jobFallback?: JobLike,
  peopleById?: Map<string, string>
): ScheduleRow | null {
  const job = visit.job || jobFallback;
  const jobberJobId = String(job?.id || "");
  if (!jobberJobId) return null;
  const title = String(visit.title || job?.title || "").trim();
  const assigned = uniqueNames([
    ...namesFromUsers(visit.assignedUsers, peopleById),
    ...namesFromUsers(visit.job?.assignedUsers, peopleById),
    ...namesFromUsers(jobFallback?.assignedUsers, peopleById),
  ]);
  return {
    jobberJobId,
    jobberVisitId: visit.id || null,
    scheduledAt: visit.startAt || jobFallback?.startAt || null,
    name: jobDisplayName(job?.jobNumber, title),
    location: formatAddress(visit.property) || formatAddress(jobFallback?.property),
    assignedNames: assigned,
    cancelled:
      isDroppedStatus(visit.visitStatus) || isDroppedStatus(job?.jobStatus),
  };
}

function rowsFromJob(job: JobLike): ScheduleRow[] {
  const visits = job.visits?.nodes || [];
  if (visits.length > 0) {
    return visits
      .map((visit) => rowFromVisit(visit, job))
      .filter((row): row is ScheduleRow => Boolean(row));
  }
  return [
    {
      jobberJobId: job.id,
      jobberVisitId: null,
      scheduledAt: job.startAt || null,
      name: jobDisplayName(job.jobNumber, String(job.title || "")),
      location: formatAddress(job.property),
      assignedNames: uniqueNames([...namesFromUsers(job.assignedUsers)]),
      cancelled: isDroppedStatus(job.jobStatus),
    },
  ];
}

async function paginateGraph<TPage>(
  accessToken: string,
  query: string,
  read: (page: TPage) => {
    nodes: unknown[];
    hasNextPage?: boolean;
    endCursor?: string | null;
  },
  extraVariables: Record<string, unknown> = {},
  maxPages = 2
): Promise<{ ok: true; nodes: unknown[]; usersHidden?: boolean } | { ok: false; error: string }> {
  const pageSize = 50;
  let after: string | null = null;
  let pages = 0;
  const nodes: unknown[] = [];
  let usersHidden = false;
  while (pages < maxPages) {
    const result = await graphqlRequest<TPage>(
      accessToken,
      query,
      {
        first: pageSize,
        after,
        ...extraVariables,
      },
      { allowPartial: false }
    );
    if (!result.ok) return result;
    if (result.usersHidden) usersHidden = true;
    pages += 1;
    const parsed = read(result.data);
    nodes.push(...parsed.nodes);
    if (!parsed.hasNextPage || !parsed.endCursor) break;
    after = parsed.endCursor;
  }
  return { ok: true, nodes, usersHidden };
}

async function fetchJobberDirectory(
  accessToken: string
): Promise<Map<string, string>> {
  const people = new Map<string, string>();
  type UsersPage = {
    users?: {
      nodes?: AssignedUserNode[];
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
    };
  };
  const result = await paginateGraph<UsersPage>(
    accessToken,
    `query SyncPeople($first: Int!, $after: String) {
      users(first: $first, after: $after) {
        nodes { id name { full } }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    (page) => ({
      nodes: page.users?.nodes || [],
      hasNextPage: page.users?.pageInfo?.hasNextPage,
      endCursor: page.users?.pageInfo?.endCursor,
    }),
    {},
    3
  );
  if (!result.ok) return people;
  for (const node of result.nodes as AssignedUserNode[]) {
    const id = String(node.id || "");
    const name = personName(node.name);
    if (id && name) people.set(id, name);
  }
  return people;
}

async function fetchScheduleRows(
  accessToken: string,
  startAfter: string,
  startBefore: string
): Promise<{ rows: ScheduleRow[]; usersHidden: boolean }> {
  const peopleById = await fetchJobberDirectory(accessToken);
  type SchedulePage = {
    scheduledItems?: {
      nodes?: VisitLike[];
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
    };
    visits?: {
      nodes?: VisitLike[];
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
    };
  };

  const extra = { startAfter, startBefore };
  const scheduledRead = (page: SchedulePage) => ({
    nodes: page.scheduledItems?.nodes || [],
    hasNextPage: page.scheduledItems?.pageInfo?.hasNextPage,
    endCursor: page.scheduledItems?.pageInfo?.endCursor,
  });
  const visitRead = (page: SchedulePage) => ({
    nodes: page.visits?.nodes || [],
    hasNextPage: page.visits?.pageInfo?.hasNextPage,
    endCursor: page.visits?.pageInfo?.endCursor,
  });
  const attempts: Array<{
    query: string;
    extra: Record<string, unknown>;
    pages: number;
    read: typeof scheduledRead;
  }> = [
    { query: SCHEDULED_ITEMS_QUERY, extra, pages: 6, read: scheduledRead },
    { query: SCHEDULED_ITEMS_SIMPLE_QUERY, extra, pages: 6, read: scheduledRead },
    { query: VISITS_STARTDATE_QUERY, extra, pages: 6, read: visitRead },
    { query: VISITS_FILTERED_QUERY, extra, pages: 6, read: visitRead },
    { query: VISITS_CALENDAR_SORTED_QUERY, extra: {}, pages: 5, read: visitRead },
    { query: VISITS_CALENDAR_QUERY, extra: {}, pages: 5, read: visitRead },
    { query: VISITS_CALENDAR_SIMPLE_QUERY, extra: {}, pages: 5, read: visitRead },
  ];

  let lastError = "Could not read Jobber calendar Team assignments";
  for (const attempt of attempts) {
    const page = await paginateGraph<SchedulePage>(
      accessToken,
      attempt.query,
      attempt.read,
      attempt.extra,
      attempt.pages
    );
    if (!page.ok) {
      lastError = page.error || lastError;
      continue;
    }
    if (page.nodes.length === 0) continue;
    const rows = (page.nodes as VisitLike[])
      .map((visit) => rowFromVisit(visit, undefined, peopleById))
      .filter((row): row is ScheduleRow => Boolean(row));
    if (rows.length > 0) {
      return { rows, usersHidden: Boolean(page.usersHidden) };
    }
  }
  throw new Error(friendlyJobberError(lastError));
}

function foldNameTokens(value: string): string {
  return normalizePersonName(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => token.replace(/s$/, ""))
    .join(" ");
}

function namesMatchLogin(jobberName: string, loginLabel: string): boolean {
  const a = normalizePersonName(jobberName);
  const b = normalizePersonName(loginLabel);
  if (!a || !b) return false;
  if (a === b) return true;
  if (foldNameTokens(a) === foldNameTokens(b)) return true;
  const aParts = a.split(" ");
  const bParts = b.split(" ");
  if (aParts.length >= 2 && bParts.length >= 2) {
    const sameOrder =
      aParts[0] === bParts[0] &&
      aParts[aParts.length - 1] === bParts[bParts.length - 1];
    const swapped =
      aParts[0] === bParts[bParts.length - 1] &&
      aParts[aParts.length - 1] === bParts[0];
    return sameOrder || swapped;
  }
  return false;
}

function namesMatchAlias(assigned: string, alias: string): boolean {
  if (namesMatchLogin(assigned, alias)) return true;
  const a = normalizePersonName(assigned);
  const b = normalizePersonName(alias);
  if (!a || !b) return false;
  if (a.length >= 8 && (a.includes(b) || b.includes(a))) return true;
  const fa = foldNameTokens(a);
  const fb = foldNameTokens(b);
  return fa.length >= 8 && (fa.includes(fb) || fb.includes(fa));
}

type JobberCrew = { teamName: string; members: string[] };

async function tryJobberQuery<T>(
  accessToken: string,
  query: string
): Promise<T | null> {
  const result = await graphqlRequest<T>(accessToken, query, undefined, {
    allowPartial: true,
  });
  return result.ok ? result.data : null;
}

function membersFromTeamNode(node: {
  name?: string | null;
  users?: UserConnection | null;
  members?: UserConnection | null;
  assignedUsers?: UserConnection | null;
}): JobberCrew | null {
  const teamName = String(node.name || "").trim();
  if (!teamName) return null;
  return {
    teamName,
    members: uniqueNames([
      ...namesFromUsers(node.users),
      ...namesFromUsers(node.members),
      ...namesFromUsers(node.assignedUsers),
    ]),
  };
}

async function fetchJobberCrews(accessToken: string): Promise<JobberCrew[]> {
  const queries = [
    `query CrewTeams {
      teams(first: 50) {
        nodes {
          name
          users(first: 50) { nodes { id name { full } } }
        }
      }
    }`,
    `query CrewTeams {
      teams(first: 50) {
        nodes {
          name
          members(first: 50) { nodes { id name { full } } }
        }
      }
    }`,
    `query CrewTeams {
      scheduleTeams(first: 50) {
        nodes {
          name
          users(first: 50) { nodes { id name { full } } }
        }
      }
    }`,
  ];
  for (const query of queries) {
    const data = await tryJobberQuery<{
      teams?: { nodes?: Array<Parameters<typeof membersFromTeamNode>[0]> };
      scheduleTeams?: { nodes?: Array<Parameters<typeof membersFromTeamNode>[0]> };
    }>(accessToken, query);
    const nodes = data?.teams?.nodes || data?.scheduleTeams?.nodes || [];
    const crews = nodes
      .map((node) => membersFromTeamNode(node))
      .filter((crew): crew is JobberCrew => Boolean(crew));
    if (crews.length) return crews;
  }
  return [];
}

async function fetchUserVehicles(
  accessToken: string
): Promise<Map<string, string[]>> {
  const byPerson = new Map<string, string[]>();
  type UsersPage = {
    users?: {
      nodes?: Array<{
        name?: JobberName;
        assignedVehicle?: { name?: string | null } | null;
      }>;
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
    };
  };
  const result = await paginateGraph<UsersPage>(
    accessToken,
    `query SyncVehicles($first: Int!, $after: String) {
      users(first: $first, after: $after) {
        nodes { id name { full } assignedVehicle { name } }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    (page) => ({
      nodes: page.users?.nodes || [],
      hasNextPage: page.users?.pageInfo?.hasNextPage,
      endCursor: page.users?.pageInfo?.endCursor,
    }),
    {},
    3
  );
  if (!result.ok) return byPerson;
  for (const node of result.nodes as Array<{
    name?: JobberName;
    assignedVehicle?: { name?: string | null } | null;
  }>) {
    const person = personName(node?.name);
    const vehicle = String(node?.assignedVehicle?.name || "").trim();
    if (!person || !vehicle) continue;
    const current = byPerson.get(person) || [];
    current.push(vehicle);
    byPerson.set(person, uniqueNames(current));
  }
  return byPerson;
}

function visitMatchesCrew(assigned: string[], crew: JobberCrew): boolean {
  if (assigned.some((name) => namesMatchAlias(name, crew.teamName))) return true;
  if (!crew.members.length || assigned.length < 2) return false;
  return assigned.every((name) =>
    crew.members.some((member) => namesMatchLogin(name, member))
  );
}

function loginMatchesJobberName(
  assigned: string,
  user: { name: string; username: string }
): boolean {
  return (
    namesMatchLogin(assigned, user.name) ||
    namesMatchLogin(assigned, user.username)
  );
}

const JOB_SYNC_TTL_MS = 8 * 60 * 1000;

type JobSyncResult = {
  skipped: boolean;
  created: number;
  updated: number;
  removed: number;
  matched: number;
  unmatchedNames: string[];
  scanned?: number;
  kept?: number;
  noCrewCount?: number;
  activeCount?: number;
  matchedNoTruckNames?: string[];
  assignedSample?: string[];
  usersHidden?: boolean;
  preview?: Array<{
    name: string;
    location: string;
    scheduledAt: string | null;
    assignedNames: string[];
    truckName: string;
  }>;
};

let syncInFlight: Promise<JobSyncResult> | null = null;

export async function syncJobberJobsToTrucks(options?: {
  force?: boolean;
  dryRun?: boolean;
}): Promise<JobSyncResult> {
  if (syncInFlight && !options?.force && !options?.dryRun) return syncInFlight;
  const run = runJobberJobSync(options);
  if (!options?.dryRun) {
    syncInFlight = run.finally(() => {
      syncInFlight = null;
    });
    return syncInFlight;
  }
  return run;
}

async function runJobberJobSync(options?: {
  force?: boolean;
  dryRun?: boolean;
}): Promise<JobSyncResult> {
  const connection = await getJobberConnection();
  if (!connection?.accessToken) {
    return {
      skipped: true,
      created: 0,
      updated: 0,
      removed: 0,
      matched: 0,
      unmatchedNames: [],
    };
  }

  const last = connection.lastJobSyncAt
    ? new Date(connection.lastJobSyncAt).getTime()
    : 0;
  if (
    !options?.dryRun &&
    !options?.force &&
    Number.isFinite(last) &&
    Date.now() - last < JOB_SYNC_TTL_MS
  ) {
    return {
      skipped: true,
      created: 0,
      updated: 0,
      removed: 0,
      matched: 0,
      unmatchedNames: [],
    };
  }

  const valid = await getValidConnection();
  const fromYmd = addDaysYmd(todayYmd(), -7);
  const toYmd = addDaysYmd(todayYmd(), 21);
  const startAfter = `${fromYmd}T00:00:00.000Z`;
  const startBefore = `${addDaysYmd(toYmd, 1)}T00:00:00.000Z`;

  const { rows, usersHidden } = await fetchScheduleRows(
    valid.accessToken,
    startAfter,
    startBefore
  );
  const users = await listPublicUsers();
  const trucks = await listTrucks();
  const [apiCrews, vehiclesByPerson] = await Promise.all([
    fetchJobberCrews(valid.accessToken),
    fetchUserVehicles(valid.accessToken),
  ]);
  const crews: JobberCrew[] = apiCrews.map((crew) => ({
    teamName: crew.teamName,
    members: [...crew.members],
  }));
  for (const truck of trucks) {
    const aliases = truck.jobberNames || [];
    const people = aliases.filter((alias) => !/\b(crew|team)\b/i.test(alias));
    for (const alias of aliases) {
      let crew = crews.find((row) => namesMatchAlias(row.teamName, alias));
      if (!crew) {
        crew = { teamName: alias, members: [] };
        crews.push(crew);
      }
      if (/\b(crew|team)\b/i.test(alias)) {
        crew.members = uniqueNames([...crew.members, ...people]);
      }
    }
  }
  const unmatched = new Set<string>();
  const matchedNoTruck = new Set<string>();
  const assignedSample = new Set<string>();
  let noCrewCount = 0;
  let activeCount = 0;
  const drafts: {
    jobberJobId: string;
    jobberVisitId?: string | null;
    scheduledAt: string | null;
    name: string;
    location: string;
    assignedNames: string[];
    truckId: string;
  }[] = [];

  const merged = new Map<string, ScheduleRow>();
  let scheduledCount = 0;
  for (const row of rows) {
    if (!row.scheduledAt) continue;
    const day = formatYmdInZone(row.scheduledAt);
    if (day && (day < fromYmd || day > toYmd)) continue;
    scheduledCount += 1;
    const key = `${row.jobberJobId}|${day || "undated"}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...row, assignedNames: [...row.assignedNames] });
      continue;
    }
    current.assignedNames = uniqueNames([
      ...current.assignedNames,
      ...row.assignedNames,
    ]);
    current.cancelled = current.cancelled && row.cancelled;
    if (!current.scheduledAt || (row.scheduledAt && row.scheduledAt < current.scheduledAt)) {
      current.scheduledAt = row.scheduledAt;
      current.jobberVisitId = row.jobberVisitId;
    }
    if (!current.location && row.location) current.location = row.location;
  }

  for (const row of merged.values()) {
    if (row.cancelled) continue;
    activeCount += 1;
    for (const name of row.assignedNames) assignedSample.add(name);
    if (row.assignedNames.length === 0) {
      noCrewCount += 1;
      continue;
    }
    const truckIds = new Set<string>();
    const teamLabels = uniqueNames(
      crews
        .filter((crew) => visitMatchesCrew(row.assignedNames, crew))
        .map((crew) => crew.teamName)
    );
    const vehicleLabels = uniqueNames(
      row.assignedNames.flatMap((name) => {
        const direct = vehiclesByPerson.get(name) || [];
        const fuzzy = [...vehiclesByPerson.entries()]
          .filter(([person]) => namesMatchLogin(name, person))
          .flatMap(([, labels]) => labels);
        return [...direct, ...fuzzy];
      })
    );
    const truckMatchNames = uniqueNames([
      ...row.assignedNames,
      ...teamLabels,
      ...vehicleLabels,
    ]);
    const matchedAliasTruck = trucks.some((truck) => {
      const aliases = [truck.name, ...(truck.jobberNames || [])];
      return truckMatchNames.some((label) =>
        aliases.some((alias) => namesMatchAlias(label, alias))
      );
    });
    for (const assigned of row.assignedNames) {
      const matches = users.filter((user) =>
        loginMatchesJobberName(assigned, user)
      );
      for (const user of matches) {
        const ids = assignedTruckIds(user);
        if (ids.length === 0) matchedNoTruck.add(user.name || user.username);
        for (const id of ids) truckIds.add(id);
      }
      if (matches.length === 0 && !matchedAliasTruck) unmatched.add(assigned);
    }
    for (const truck of trucks) {
      const aliases = [truck.name, ...(truck.jobberNames || [])];
      if (
        truckMatchNames.some((label) =>
          aliases.some((alias) => namesMatchAlias(label, alias))
        )
      ) {
        truckIds.add(truck.id);
      }
    }
    for (const truckId of truckIds) {
      drafts.push({
        jobberJobId: row.jobberJobId,
        jobberVisitId: row.jobberVisitId,
        scheduledAt: row.scheduledAt,
        name: row.name,
        location: row.location || "Scheduled in Jobber",
        assignedNames: row.assignedNames,
        truckId,
      });
    }
  }

  const truckName = (id: string) =>
    trucks.find((truck) => truck.id === id)?.name || "Unknown truck";
  const diagnostics = {
    scanned: scheduledCount,
    activeCount,
    unmatchedNames: [...unmatched].sort((a, b) => a.localeCompare(b)),
    noCrewCount,
    matchedNoTruckNames: [...matchedNoTruck].sort((a, b) => a.localeCompare(b)),
    assignedSample: [...assignedSample].sort((a, b) => a.localeCompare(b)).slice(0, 12),
    usersHidden,
  };

  if (options?.dryRun) {
    return {
      skipped: false,
      created: 0,
      updated: 0,
      removed: 0,
      matched: drafts.length,
      ...diagnostics,
      preview: drafts.map((draft) => ({
        name: draft.name,
        location: draft.location,
        scheduledAt: draft.scheduledAt,
        assignedNames: draft.assignedNames,
        truckName: truckName(draft.truckId),
      })),
    };
  }

  const result = await upsertJobberTruckJobs({
    drafts,
    windowFromYmd: fromYmd,
    windowToYmd: toYmd,
  });

  return {
    skipped: false,
    ...result,
    matched: drafts.length,
    ...diagnostics,
  };
}

export async function disconnectJobberRemote(): Promise<void> {
  try {
    const connection = await getValidConnection();
    await graphql(
      connection.accessToken,
      `mutation { appDisconnect { app { name } userErrors { message } } }`
    );
  } catch {
    // Still clear local tokens even if remote disconnect fails
  }
  await setJobberConnection(null);
}
