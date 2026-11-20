"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  {
    href: "/",
    label: "Stock",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path d="M12 12v9M4 7.5l8 4.5 8-4.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    href: "/checkout",
    label: "Out",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M9 7H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M15 3h6v6M21 3l-9 9"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/trucks",
    label: "Trucks",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M3 7h11v10H3V7Zm11 3h4l3 3v4h-7V10Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M7 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
    ),
  },
  {
    href: "/more",
    label: "More",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M5 12h.01M12 12h.01M19 12h.01"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

export function BottomNav({ crew = false }: { crew?: boolean }) {
  const pathname = usePathname();
  const visible = crew
    ? links.filter((link) => link.href === "/checkout" || link.href === "/trucks")
    : links;

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {visible.map((link) => {
        const active =
          link.href === "/"
            ? pathname === "/"
            : link.href === "/more"
              ? [
                  "/more",
                  "/jobs",
                  "/templates",
                  "/estimates",
                ].some(
                  (p) => pathname === p || pathname.startsWith(`${p}/`)
                )
              : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            prefetch
            className={
              active
                ? link.href === "/trucks"
                  ? "active nav-trucks"
                  : "active"
                : undefined
            }
          >
            {link.icon}
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
