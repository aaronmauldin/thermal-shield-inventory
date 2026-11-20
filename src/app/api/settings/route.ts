import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/guard";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const settings = await getSettings();
  if (user?.role !== "admin") {
    return NextResponse.json({ companyName: settings.companyName });
  }
  return NextResponse.json({
    ...settings,
    smtpPass: settings.smtpPass ? "••••••••" : "",
  });
}

export async function PATCH(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await request.json();
  const patch: Record<string, unknown> = {};

  if (body.alertEmail !== undefined) patch.alertEmail = String(body.alertEmail).trim();
  if (body.companyName !== undefined) patch.companyName = String(body.companyName).trim();
  if (body.smtpHost !== undefined) patch.smtpHost = String(body.smtpHost).trim();
  if (body.smtpPort !== undefined) patch.smtpPort = Number(body.smtpPort) || 587;
  if (body.smtpUser !== undefined) patch.smtpUser = String(body.smtpUser).trim();
  if (body.smtpPass !== undefined && body.smtpPass !== "••••••••") {
    patch.smtpPass = String(body.smtpPass);
  }
  if (body.smtpFrom !== undefined) patch.smtpFrom = String(body.smtpFrom).trim();
  if (body.alertsEnabled !== undefined) patch.alertsEnabled = Boolean(body.alertsEnabled);

  const settings = await updateSettings(patch);
  return NextResponse.json({
    ...settings,
    smtpPass: settings.smtpPass ? "••••••••" : "",
  });
}
