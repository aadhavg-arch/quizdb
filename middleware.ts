// middleware.ts
// ⚠️  MUST be at the ROOT of the repo — same folder as package.json
// ⚠️  NOT inside app/, pages/, or src/

import { NextRequest, NextResponse } from "next/server";

const PUBLIC = ["/login", "/api/auth"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow: login page, auth API, Next.js internals, favicon
  if (
    PUBLIC.some(p => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // ── Validate session cookie ──────────────────────────────────────────────
  // Cookie format:  userId__SECRET
  // Both halves must be present and the SECRET half must match the env var.
  const secret  = process.env.SESSION_SECRET;
  const cookie  = req.cookies.get("qb_session")?.value ?? "";
  const parts   = cookie.split("__");
  const isValid = (
    parts.length === 2 &&
    parts[0].length > 0 &&
    parts[1].length > 0 &&
    secret &&                        // secret MUST be set in Vercel env vars
    parts[1] === secret
  );

  if (!isValid) {
    // Wipe any stale / invalid cookie and redirect to login
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search   = `?next=${encodeURIComponent(pathname)}`;
    const res = NextResponse.redirect(url);
    res.cookies.set("qb_session", "", { maxAge: 0, path: "/" });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static  (static files)
     * - _next/image   (image optimisation)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
};
