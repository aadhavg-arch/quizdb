// app/api/auth/route.ts
import { NextRequest, NextResponse } from "next/server";

// ─── Parse multiple users from environment variables ───────────────────────
//
// Format in Vercel env vars:
//
//   QUIZ_USERS = alice:pass1,bob:pass2,carol:pass3
//
// Each entry is  userId:password  separated by commas.
// Whitespace around entries/colons is trimmed.
//
// Legacy single-user fallback (still works if QUIZ_USERS is not set):
//   QUIZ_USER_ID = admin
//   QUIZ_PASSWORD = secret
//
function loadUsers(): Map<string, string> {
  const map = new Map<string, string>();

  // New multi-user variable
  const raw = process.env.QUIZ_USERS ?? "";
  if (raw.trim()) {
    for (const entry of raw.split(",")) {
      const colonIdx = entry.indexOf(":");
      if (colonIdx < 1) continue;
      const uid  = entry.slice(0, colonIdx).trim();
      const pass = entry.slice(colonIdx + 1).trim();
      if (uid && pass) map.set(uid, pass);
    }
  }

  // Legacy single-user fallback
  const legacyUser = process.env.QUIZ_USER_ID?.trim();
  const legacyPass = process.env.QUIZ_PASSWORD?.trim();
  if (legacyUser && legacyPass && !map.has(legacyUser)) {
    map.set(legacyUser, legacyPass);
  }

  // Hard-coded emergency fallback so the app is never completely locked
  if (map.size === 0) {
    map.set("admin", "quizbowl2025");
  }

  return map;
}

// ─── POST /api/auth — Login ──────────────────────────────────────────────────
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
    return NextResponse.json({ error: "User ID and password are required." }, { status: 400 });
  }

  const users  = loadUsers();
  const secret = process.env.SESSION_SECRET ?? "qb_secret_change_me";

  const expectedPass = users.get(userId);
  if (!expectedPass || expectedPass !== password) {
    // Return 401 — don't reveal whether it was the user ID or the password
    return NextResponse.json({ error: "Invalid user ID or password." }, { status: 401 });
  }

  // Issue session cookie (httpOnly — not accessible from JavaScript)
  const res = NextResponse.json({ ok: true, userId });
  res.cookies.set("qb_session", secret, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   60 * 60 * 8, // 8 hours
    path:     "/",
  });
  return res;
}

// ─── DELETE /api/auth — Logout ───────────────────────────────────────────────
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
