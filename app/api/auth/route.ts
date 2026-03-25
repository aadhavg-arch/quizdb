// app/api/auth/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let userId = "", password = "";
  try {
    const b = await req.json();
    userId   = (b.userId   ?? "").trim();
    password = (b.password ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const validUser = process.env.QUIZ_USER_ID    ?? "admin";
  const validPass = process.env.QUIZ_PASSWORD    ?? "quizbowl2025";
  const secret    = process.env.SESSION_SECRET   ?? "qb_secret_change_me";

  if (userId !== validUser || password !== validPass) {
    return NextResponse.json({ error: "Invalid user ID or password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("qb_session", secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8 hours
    path: "/",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("qb_session", "", { maxAge: 0, path: "/" });
  return res;
}
