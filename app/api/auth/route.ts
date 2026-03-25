// app/api/auth/route.ts

import { NextRequest, NextResponse } from "next/server";

// ── Load all valid users from env ─────────────────────────────────────────
// QUIZ_USERS format:  alice:pass1,bob:pass2,carol:pass3
// Legacy fallback:    QUIZ_USER_ID + QUIZ_PASSWORD  (still works)
function loadUsers(): Map<string, string> {
  const map = new Map<string, string>();

  const raw = (process.env.QUIZ_USERS ?? "").trim();
  if (raw) {
    for (const entry of raw.split(",")) {
      const idx = entry.indexOf(":");
      if (idx < 1) continue;
      const uid  = entry.slice(0, idx).trim();
      const pass = entry.slice(idx + 1).trim();
      if (uid && pass) map.set(uid, pass);
    }
  }

  // Legacy single-user env vars
  const lu = process.env.QUIZ_USER_ID?.trim();
  const lp = process.env.QUIZ_PASSWORD?.trim();
  if (lu && lp && !map.has(lu)) map.set(lu, lp);

  // Hard fallback — only if env vars are completely missing
  if (map.size === 0) map.set("admin", "quizbowl2025");

  return map;
}

// ── POST /api/auth  →  Login ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let userId = "", password = "";
  try {
    const b = await req.json();
    userId   = (b.userId   ?? "").trim();
    password = (b.password ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  if (!userId || !password) {
    return NextResponse.json(
      { error: "User ID and password are required." }, { status: 400 }
    );
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // SESSION_SECRET is not configured in Vercel env vars
    return NextResponse.json(
      { error: "Server misconfiguration: SESSION_SECRET is not set. Ask your administrator." },
      { status: 500 }
    );
  }

  const users        = loadUsers();
  const expectedPass = users.get(userId);

  if (!expectedPass || expectedPass !== password) {
    return NextResponse.json(
      { error: "Invalid user ID or password." }, { status: 401 }
    );
  }

  // Cookie value = "userId__SECRET"
  // Middleware validates both parts — a random cookie value won't pass.
  const cookieValue = `${userId}__${secret}`;

  const res = NextResponse.json({ ok: true, userId });
  res.cookies.set("qb_session", cookieValue, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   60 * 60 * 8,   // 8 hours
    path:     "/",
  });
  return res;
}

// ── DELETE /api/auth  →  Logout ───────────────────────────────────────────
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("qb_session", "", {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   0,
    path:     "/",
  });
  return res;
}
