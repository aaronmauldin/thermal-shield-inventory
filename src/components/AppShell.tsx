"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { clearAppBadge } from "@/lib/notify-client";
import { homeForRole } from "@/lib/roles";
import {
  CalendarEmblem,
  ChartEmblem,
  CheckoutEmblem,
  HistoryEmblem,
  InventoryEmblem,
  TemplateEmblem,
  TruckEmblem,
} from "./Emblems";
import { AccountMenu } from "./AccountMenu";
import { BottomNav } from "./BottomNav";
import { useAuth } from "./AuthProvider";

type LiveAlert = { title: string; body: string };
type IconComp = ComponentType<{ size?: number }>;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [companyName, setCompanyName] = useState("TSI INV");
  const [liveAlert, setLiveAlert] = useState<LiveAlert | null>(null);
  const isLogin = pathname === "/login";
  const isCrew = user?.role === "crew";

  useEffect(() => {
    if (isLogin) return;
    let cancelled = false;
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.companyName) {
          setCompanyName(data.companyName);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isLogin]);

  useEffect(() => {
    if (isLogin) return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js?v=2", { scope: "/" })
      .catch(() => undefined);

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "STOCK_ALERT") return;
      setLiveAlert({
        title: String(event.data.title || "TSI INV"),
        body: String(event.data.body || "Stock needs attention"),
      });
      void clearAppBadge();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    void clearAppBadge();

    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [isLogin]);

  if (isLogin) {
    return <>{children}</>;
  }

  const homeHref = user ? homeForRole(user.role) : "/";

  return (
    <div className="app-shell">
      {liveAlert ? (
        <div className="push-toast" role="status">
          <div>
            <strong>{liveAlert.title}</strong>
            <p>{liveAlert.body}</p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setLiveAlert(null)}
          >
            OK
          </button>
        </div>
      ) : null}
      <header className="app-header">
        <div className="shell-top">
          <div className="brand-block">
            <Link href={homeHref} className="brand-mark" style={{ fontSize: 22 }} prefetch>
              <img
                src="/tsi-logo.png"
                alt="TSI"
                width={48}
                height={48}
                className="brand-logo"
              />
              {companyName}
            </Link>
          </div>
          <AccountMenu />
        </div>

        <div className="top-links">
          {isCrew ? (
            <>
              <TopLink
                href="/checkout"
                active={pathname.startsWith("/checkout")}
                icon={CheckoutEmblem}
              >
                Check out
              </TopLink>
              <TopLink
                href="/trucks"
                active={pathname.startsWith("/trucks")}
                icon={TruckEmblem}
              >
                Trucks
              </TopLink>
            </>
          ) : (
            <>
              <TopLink href="/" active={pathname === "/"} icon={InventoryEmblem}>
                Stock
              </TopLink>
              <TopLink
                href="/checkout"
                active={pathname.startsWith("/checkout")}
                icon={CheckoutEmblem}
              >
                Check out
              </TopLink>
              <TopLink
                href="/trucks"
                active={pathname.startsWith("/trucks")}
                icon={TruckEmblem}
              >
                Trucks
              </TopLink>
              <TopLink
                href="/jobs"
                active={pathname.startsWith("/jobs")}
                icon={ChartEmblem}
              >
                Material usage
              </TopLink>
              <TopLink
                href="/estimates"
                active={pathname.startsWith("/estimates")}
                icon={CalendarEmblem}
              >
                Upcoming material
              </TopLink>
              <TopLink
                href="/templates"
                active={pathname.startsWith("/templates")}
                icon={TemplateEmblem}
              >
                Templates
              </TopLink>
              <TopLink
                href="/history"
                active={pathname.startsWith("/history")}
                icon={HistoryEmblem}
              >
                History
              </TopLink>
            </>
          )}
        </div>
      </header>

      <main>
        {children}
      </main>
      <BottomNav crew={isCrew} />
    </div>
  );
}

function TopLink({
  href,
  active,
  icon: Icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: IconComp;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch
      className={`btn btn-secondary top-link${active ? " top-link-active" : ""}`}
    >
      <span className="top-link-icon">
        <Icon size={16} />
      </span>
      {children}
    </Link>
  );
}
