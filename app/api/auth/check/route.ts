// app/api/auth/check/route.ts
// Called by the login page to skip re-login if the session is still valid.

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const secret = process.env.SESSION_SECRET;
  const cookie = req.cookies.get("qb_session")?.value ?? "";
  const parts  = cookie.split("__");

  const valid = (
    parts.length === 2 &&
    parts[0].length > 0 &&
    secret &&
    parts[1] === secret
  );

  if (valid) {
    return NextResponse.json({ ok: true, userId: parts[0] });
  }
  return NextResponse.json({ ok: false }, { status: 401 });
}
