// middleware.ts  ← ROOT of repo (same level as package.json, NOT inside app/)
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow login page, auth API, and Next.js internals
  if (
    PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Every other route requires a valid session cookie
  const session = req.cookies.get("qb_session")?.value;
  if (!session) {
    // Not logged in → redirect to /login, preserving the original URL as ?next=
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Validate the cookie value against SESSION_SECRET
  const secret = process.env.SESSION_SECRET ?? "qb_secret_change_me";
  if (session !== secret) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    const res = NextResponse.redirect(loginUrl);
    // Clear the invalid cookie
    res.cookies.set("qb_session", "", { maxAge: 0, path: "/" });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  // Protect every route except Next.js static files and image optimiser
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
