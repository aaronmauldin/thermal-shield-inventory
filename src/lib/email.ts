import { getSettings, listCategories, listItems, markAlertSent } from "./db";
import { sendPushToAll } from "./push";
import { categoryName, stockStatus, type InventoryItem } from "./types";

const ALERT_COOLDOWN_MS = 1000 * 60 * 60 * 12; // 12 hours

function isDueForAlert(item: InventoryItem): boolean {
  const status = stockStatus(item);
  if (status === "ok") return false;
  if (!item.lastAlertSentAt) return true;
  return Date.now() - new Date(item.lastAlertSentAt).getTime() >= ALERT_COOLDOWN_MS;
}

/** Status got worse (ok→low/out or low→out) — always notify every subscribed phone. */
export function stockAlertWorsened(
  before: InventoryItem | null | undefined,
  after: InventoryItem
): boolean {
  const next = stockStatus(after);
  if (next === "ok") return false;
  if (!before) return true;
  const prev = stockStatus(before);
  if (prev === "ok") return true;
  if (prev === "low" && next === "out") return true;
  return false;
}

function buildEmailContent(
  company: string,
  lowItems: InventoryItem[],
  categories: Awaited<ReturnType<typeof listCategories>>
) {
  const rows = lowItems
    .map((item) => {
      const status = stockStatus(item) === "out" ? "OUT" : "LOW";
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${item.name}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${categoryName(categories, item.category)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:${status === "OUT" ? "#b91c1c" : "#c2410c"};">${item.quantity} ${item.unit}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${item.lowStockThreshold} ${item.unit}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${item.location || "—"}</td>
      </tr>`;
    })
    .join("");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">
      <div style="background:#1e6fd9;color:white;padding:20px 24px;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;font-size:20px;">${company} — Low Stock Alert</h1>
        <p style="margin:8px 0 0;opacity:.9;">${lowItems.length} item${lowItems.length === 1 ? "" : "s"} need attention</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;padding:8px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="text-align:left;color:#64748b;">
              <th style="padding:10px 12px;">Item</th>
              <th style="padding:10px 12px;">Category</th>
              <th style="padding:10px 12px;">Qty</th>
              <th style="padding:10px 12px;">Min</th>
              <th style="padding:10px 12px;">Location</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;

  const text = lowItems
    .map(
      (item) =>
        `${item.name}: ${item.quantity} ${item.unit} (min ${item.lowStockThreshold}) — ${item.location}`
    )
    .join("\n");

  return { html, text };
}

function buildPushCopy(company: string, lowItems: InventoryItem[]) {
  const out = lowItems.filter((item) => stockStatus(item) === "out");
  const low = lowItems.filter((item) => stockStatus(item) === "low");
  const title =
    out.length > 0
      ? `${company}: ${out.length} out of stock`
      : `${company}: ${low.length} low stock`;

  const names = lowItems.slice(0, 3).map((item) => {
    const status = stockStatus(item) === "out" ? "OUT" : "LOW";
    return `${item.name} (${status} ${item.quantity} ${item.unit})`;
  });
  const more =
    lowItems.length > 3 ? ` +${lowItems.length - 3} more` : "";
  const body = `${names.join(", ")}${more}`;

  return { title, body };
}

async function sendWithResend(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend failed: ${body}`);
  }
}

async function sendWithSmtp(opts: {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: opts.port === 465,
    auth: { user: opts.user, pass: opts.pass },
  });

  await transporter.sendMail({
    from: opts.from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}

async function sendEmailForItems(
  company: string,
  lowItems: InventoryItem[],
  categories: Awaited<ReturnType<typeof listCategories>>,
  alertEmail: string,
  settings: Awaited<ReturnType<typeof getSettings>>
): Promise<{ sent: boolean; reason?: string }> {
  if (!alertEmail) {
    return { sent: false, reason: "No alert email configured" };
  }

  const { html, text } = buildEmailContent(company, lowItems, categories);
  const subject = `[${company}] ${lowItems.length} inventory item${lowItems.length === 1 ? "" : "s"} low`;

  const resendKey = process.env.RESEND_API_KEY || "";
  const resendFrom =
    process.env.RESEND_FROM ||
    settings.smtpFrom ||
    "TSI INV <onboarding@resend.dev>";

  if (resendKey) {
    await sendWithResend({
      apiKey: resendKey,
      from: resendFrom,
      to: alertEmail,
      subject,
      html,
      text,
    });
    return { sent: true };
  }

  const host = settings.smtpHost || process.env.SMTP_HOST || "";
  const user = settings.smtpUser || process.env.SMTP_USER || "";
  const pass = settings.smtpPass || process.env.SMTP_PASS || "";
  const from =
    settings.smtpFrom || process.env.SMTP_FROM || user || "inventory@localhost";

  if (!host || !user || !pass) {
    return {
      sent: false,
      reason:
        "Email is not configured. For Cloudflare, set RESEND_API_KEY (easiest). For local use, add SMTP settings.",
    };
  }

  await sendWithSmtp({
    host,
    port: settings.smtpPort || Number(process.env.SMTP_PORT || 587),
    user,
    pass,
    from,
    to: alertEmail,
    subject,
    html,
    text,
  });
  return { sent: true };
}

export async function sendLowStockAlerts(
  force = false,
  /** Item IDs that just crossed into low/out — bypass the 12h cooldown */
  forceIds: string[] = []
): Promise<{
  sent: boolean;
  reason?: string;
  count: number;
  items: string[];
  emailSent: boolean;
  pushSent: boolean;
  pushDevices: number;
}> {
  const settings = await getSettings();
  if (!settings.alertsEnabled) {
    return {
      sent: false,
      reason: "Alerts are disabled",
      count: 0,
      items: [],
      emailSent: false,
      pushSent: false,
      pushDevices: 0,
    };
  }

  const [items, categories] = await Promise.all([listItems(), listCategories()]);
  const forced = new Set(forceIds);
  const lowItems = items.filter((item) => {
    if (stockStatus(item) === "ok") return false;
    if (force) return true;
    if (forced.has(item.id)) return true;
    return isDueForAlert(item);
  });

  if (lowItems.length === 0) {
    return {
      sent: false,
      reason: "No low-stock items need alerting",
      count: 0,
      items: [],
      emailSent: false,
      pushSent: false,
      pushDevices: 0,
    };
  }

  const company = settings.companyName || "TSI INV";
  const reasons: string[] = [];
  let emailSent = false;
  let pushSent = false;
  let pushDevices = 0;

  try {
    const emailResult = await sendEmailForItems(
      company,
      lowItems,
      categories,
      settings.alertEmail,
      settings
    );
    emailSent = emailResult.sent;
    if (!emailResult.sent && emailResult.reason) {
      reasons.push(emailResult.reason);
    }
  } catch (err) {
    reasons.push(err instanceof Error ? err.message : "Email failed");
  }

  try {
    const pushCopy = buildPushCopy(company, lowItems);
    const pushResult = await sendPushToAll({
      title: pushCopy.title,
      body: pushCopy.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: `tsi-stock-${Date.now()}`,
      renotify: true,
      requireInteraction: true,
      data: { url: "/" },
    });
    pushDevices = pushResult.sent;
    pushSent = pushResult.sent > 0;
    if (!pushSent && pushResult.reason) {
      reasons.push(pushResult.reason);
    }
  } catch (err) {
    reasons.push(err instanceof Error ? err.message : "Push failed");
  }

  const sent = emailSent || pushSent;
  if (sent) {
    await markAlertSent(lowItems.map((item) => item.id));
  }

  return {
    sent,
    reason: sent ? undefined : reasons.join(" · ") || "Alert was not sent",
    count: lowItems.length,
    items: lowItems.map((item) => item.name),
    emailSent,
    pushSent,
    pushDevices,
  };
}
