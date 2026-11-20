import type { UserRole } from "./types";

export function homeForRole(role: UserRole) {
  return role === "crew" ? "/checkout" : "/";
}

export function isCrewAllowedPath(pathname: string) {
  return (
    pathname === "/checkout" ||
    pathname.startsWith("/checkout/") ||
    pathname === "/trucks" ||
    pathname.startsWith("/trucks/") ||
    pathname === "/tally" ||
    pathname.startsWith("/tally/")
  );
}
