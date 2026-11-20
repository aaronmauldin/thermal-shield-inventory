"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import {
  CategoryEmblem,
  EmblemBadge,
  HistoryEmblem,
  PlusBoxEmblem,
  SettingsEmblem,
} from "./Emblems";
import { useAuth } from "./AuthProvider";

type IconComp = ComponentType<{ size?: number }>;

const accountLinks: { href: string; title: string; tone: "orange" | "teal"; icon: IconComp }[] = [
  { href: "/history", title: "History", tone: "orange", icon: HistoryEmblem },
  { href: "/categories", title: "Categories", tone: "teal", icon: CategoryEmblem },
  { href: "/items/new", title: "Add material", tone: "orange", icon: PlusBoxEmblem },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TSI";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function AccountMenu() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const isCrew = user?.role === "crew";

  useEffect(() => {
    setMounted(true);
  }, []);

  function placeMenu() {
    const trigger = rootRef.current?.querySelector(".account-menu-trigger");
    if (!(trigger instanceof HTMLElement)) return;
    const rect = trigger.getBoundingClientRect();
    setMenuPos({
      top: Math.round(rect.bottom + 10),
      right: Math.round(window.innerWidth - rect.right),
    });
  }

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    placeMenu();
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || dropRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const menu =
    open && mounted
      ? createPortal(
        <div
          ref={dropRef}
          className="account-dropdown"
          role="menu"
          style={{ top: menuPos.top, right: menuPos.right }}
        >
          <div className="account-dropdown-head">
            <strong>{user.name}</strong>
            <span>{isCrew ? "Crew" : "Admin"}</span>
          </div>
          <button
            type="button"
            className="account-drop-item"
            role="menuitem"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
          {isCrew ? null : (
            <>
              <div className="account-dropdown-label">Account & Settings</div>
              {accountLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    role="menuitem"
                    className="account-drop-item"
                    onClick={() => setOpen(false)}
                  >
                    <EmblemBadge tone={link.tone}>
                      <Icon size={18} />
                    </EmblemBadge>
                    {link.title}
                  </Link>
                );
              })}
              <Link
                href="/settings"
                role="menuitem"
                className="account-drop-item account-drop-settings"
                onClick={() => setOpen(false)}
              >
                <EmblemBadge tone="slate">
                  <SettingsEmblem size={18} />
                </EmblemBadge>
                Settings
              </Link>
            </>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        type="button"
        className="account-menu-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setOpen((value) => {
            const next = !value;
            if (next) placeMenu();
            return next;
          });
        }}
      >
        <div className="shell-hello-copy">
          <strong>Hello, {user.name.split(" ")[0]}</strong>
          <span>{isCrew ? "Crew" : "Admin"}</span>
        </div>
        <span className="avatar" aria-hidden>
          {initials(user.name)}
        </span>
      </button>
      {menu}
    </div>
  );
}
