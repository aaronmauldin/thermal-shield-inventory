"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { homeForRole, isCrewAllowedPath } from "@/lib/roles";
import type { PublicUser } from "@/lib/types";

type AuthValue = {
  user: PublicUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue>({
  user: null,
  loading: true,
  signOut: async () => undefined,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(pathname !== "/login");
  const loaded = useRef(false);

  useEffect(() => {
    if (pathname === "/login") {
      loaded.current = false;
      setLoading(false);
      return;
    }
    if (loaded.current) return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    setLoading(true);
    fetch("/api/me", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setUser(data?.user ?? null);
        loaded.current = true;
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        clearTimeout(timer);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [pathname]);

  useEffect(() => {
    if (loading || !user) return;
    if (user.role === "crew" && !isCrewAllowedPath(pathname)) {
      router.replace(homeForRole("crew"));
    }
  }, [loading, user, pathname, router]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.replace("/login");
    router.refresh();
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, signOut }),
    [user, loading, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
