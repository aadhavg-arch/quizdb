// app/api/auth/check/route.ts
// Simple endpoint the login page hits to test if the session cookie is valid.
// Returns 200 if logged in, 401 if not — no body needed.
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = req.cookies.get("qb_session")?.value;
  const secret  = process.env.SESSION_SECRET ?? "qb_secret_change_me";
  if (session && session === secret) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false }, { status: 401 });
}
