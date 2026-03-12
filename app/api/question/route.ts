// app/api/question/route.ts
import { NextRequest, NextResponse } from "next/server";

function jsonErr(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status, headers: { "Content-Type": "application/json" } });
}

// QB Reader exact category names (first letter of each word capitalised)
const CAT_MAP: Record<string, string> = {
  "History": "History",
  "Science": "Science",
  "Literature": "Literature",
  "Fine Arts": "Fine Arts",
  "Mythology": "Mythology",
  "Philosophy": "Philosophy",
  "Social Science": "Social Science",
  "Current Events": "Current Events",
  "Geography": "Geography",
  "Pop Culture": "Pop Culture",
};

// QB Reader exact subcategory names
const SUBCAT_MAP: Record<string, string> = {
  // History
  "American History":    "American History",
  "Ancient History":     "Ancient History",
  "European History":    "European History",
  "World History":       "World History",
  "Other History":       "Other History",
  // Science
  "Biology":             "Biology",
  "Chemistry":           "Chemistry",
  "Physics":             "Physics",
  "Math":                "Math",
  "Other Science":       "Other Science",
  "Earth Science":       "Earth Science",
  "Computer Science":    "Computer Science",
  // Literature
  "American Literature": "American Literature",
  "British Literature":  "British Literature",
  "European Literature": "European Literature",
  "World Literature":    "World Literature",
  "Other Literature":    "Other Literature",
  // Fine Arts
  "Visual Fine Arts":    "Visual Fine Arts",
  "Auditory Fine Arts":  "Auditory Fine Arts",
  "Other Fine Arts":     "Other Fine Arts",
  // Mythology
  "Mythology":           "Mythology",
  // Philosophy
  "Philosophy":          "Philosophy",
  // Social Science
  "Social Science":      "Social Science",
  "Economics":           "Economics",
  "Psychology":          "Psychology",
  "Linguistics":         "Linguistics",
  // Geography
  "Geography":           "Geography",
};

export async function POST(req: NextRequest) {
  let category = "History", subcategory = "", difficulty = "1";
  let usedIds: string[] = [];

  try {
    const body = await req.json();
    category    = CAT_MAP[body.category]    ?? "History";
    subcategory = SUBCAT_MAP[body.subArea]  ?? "";
    difficulty  = body.difficulty           ?? "1";
    usedIds     = Array.isArray(body.usedIds) ? body.usedIds : [];
  } catch { /* defaults */ }

  // Try up to 5 times to find a question we haven't seen yet
  for (let attempt = 0; attempt < 5; attempt++) {
    const url = new URL("https://www.qbreader.org/api/random-tossup");
    url.searchParams.set("difficulties",   difficulty);
    url.searchParams.set("categories",     category);
    if (subcategory) url.searchParams.set("subcategories", subcategory);
    url.searchParams.set("number",         "1");
    url.searchParams.set("standardOnly",   "true");

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
    } catch (e) {
      console.error("QB Reader fetch error:", e);
      return jsonErr("Could not reach QB Reader. Please try again.");
    }

    if (!res.ok) return jsonErr(`QB Reader returned ${res.status}.`);

    const data = await res.json() as {
      tossups?: Array<{
        _id?: string;
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
    if (!t) continue;

    // Skip if we've seen this question before
    const id = t._id ?? `${t.question?.slice(0,40)}`;
    if (usedIds.includes(id) && usedIds.length < 50) continue;

    const stripHtml = (s: string) =>
      s.replace(/<[^>]+>/g, "").replace(/&amp;/g,"&").replace(/&lt;/g,"<")
       .replace(/&gt;/g,">").replace(/&quot;/g,'"').trim();

    return NextResponse.json({
      _id:         id,
      question:    t.question_sanitized ?? t.question ?? "",
      answer:      stripHtml(t.answer_sanitized ?? t.answer ?? ""),
      category:    t.category    ?? category,
      subcategory: t.subcategory ?? subcategory,
      setName:     t.set?.name   ?? "",
      difficulty:  t.difficulty  ?? 1,
    }, { headers: { "Content-Type": "application/json" } });
  }

  return jsonErr("No new question found — try a different sub-area or reset your history.");
}
