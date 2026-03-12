// app/api/question/route.ts  ← exact file path in your repo
// Fetches real questions from QB Reader public API (no key needed)

import { NextRequest, NextResponse } from "next/server";

function jsonErr(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status, headers: { "Content-Type": "application/json" } });
}

// Map our UI categories → QB Reader category names
const CAT_MAP: Record<string, string> = {
  "History": "History",
  "Science": "Science",
  "Literature": "Literature",
  "Fine Arts": "Fine Arts",
  "Mythology": "Mythology",
  "Geography": "Geography",
  "Philosophy": "Philosophy",
  "Social Science": "Social Science",
  "Current Events": "Current Events",
  "Pop Culture": "Trash",
};

// Map UI difficulty → QB Reader difficulty number
// 1=MS, 2=Easy HS, 3=Regular HS, 4=Hard HS, 5=Nationals
const DIFF_MAP: Record<string, string> = {
  "Middle School": "1",
  "Easy": "1",
  "Hard": "2",
  "High School": "3",
};

export async function POST(req: NextRequest) {
  let category = "History", difficulty = "1";
  try {
    const body = await req.json();
    category   = CAT_MAP[body.category] ?? "History";
    difficulty = body.difficulty ?? "1";
  } catch { /* use defaults */ }

  const url = new URL("https://www.qbreader.org/api/random-tossup");
  url.searchParams.set("difficulties", difficulty);
  url.searchParams.set("categories",   category);
  url.searchParams.set("number",       "1");

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      // 8-second timeout
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    console.error("QB Reader fetch error:", e);
    return jsonErr("Could not reach QB Reader. Please try again.");
  }

  if (!res.ok) return jsonErr(`QB Reader returned ${res.status}.`);

  const data = await res.json() as {
    tossups?: Array<{
      question?: string;
      question_sanitized?: string;
      answer?: string;
      answer_sanitized?: string;
      category?: string;
      subcategory?: string;
      difficulty?: number;
      set?: { name?: string };
    }>;
  };

  const t = data.tossups?.[0];
  if (!t) return jsonErr("No tossup found. Try a different category.");

  // Clean HTML from answer (QB Reader sometimes returns <b>Answer</b>)
  const stripHtml = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').trim();

  return NextResponse.json({
    question:    t.question_sanitized ?? t.question ?? "",
    answer:      stripHtml(t.answer_sanitized ?? t.answer ?? ""),
    category:    t.category    ?? category,
    subcategory: t.subcategory ?? "",
    setName:     t.set?.name   ?? "",
    difficulty:  t.difficulty  ?? 1,
  }, { headers: { "Content-Type": "application/json" } });
}
