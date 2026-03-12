// app/api/question/route.ts
// ⚠️  This file MUST be at: app/api/question/route.ts  (not in project root!)
// Add ANTHROPIC_API_KEY in Vercel → Project → Settings → Environment Variables → Redeploy

import { NextRequest, NextResponse } from "next/server";

// Helper: always returns JSON so the client never sees an HTML error page
function jsonError(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  // 1. API key check — clearest possible error message
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonError(
      "⚠️ ANTHROPIC_API_KEY is not set. Go to Vercel → your project → Settings → Environment Variables → add ANTHROPIC_API_KEY → Save → Redeploy."
    );
  }

  // 2. Parse request body safely
  let subject = "History", subArea = "World History", difficulty = "Middle School Standard";
  try {
    const body = await req.json();
    subject    = body.subject    ?? subject;
    subArea    = body.subArea    ?? subArea;
    difficulty = body.difficulty ?? difficulty;
  } catch {
    // use defaults — body parse failure is non-fatal
  }

  // 3. Build prompt
  const prompt = `You are an expert NAQT (National Academic Quiz Tournaments) question writer for middle school.

Generate ONE pyramid tossup question:
Subject: ${subject} / ${subArea}
Difficulty: ${difficulty}

RULES:
1. Pyramid structure: hardest/obscure clues first, easiest/well-known clues last
2. Place marker "(*)" exactly ONCE — where a well-prepared player should buzz
3. Final sentence must start with "For 10 points,"
4. 4-6 sentences total, 100% factually accurate

Return ONLY valid JSON — absolutely no markdown, no code fences, no text before or after:
{"tossup":"full text with (*) exactly once","answer":"primary answer","alternates":["alt1","alt2"],"clue":"one key sentence","powerClues":["fact1","fact2","fact3"]}`;

  // 4. Call Anthropic
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (netErr) {
    console.error("Network error reaching Anthropic:", netErr);
    return jsonError("Network error reaching Anthropic. Check Vercel function logs.");
  }

  // 5. Handle Anthropic HTTP errors
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`Anthropic ${response.status}:`, body.slice(0, 300));
    if (response.status === 400) return jsonError("❌ Bad request (400). This is usually a wrong model name — the code has been fixed, please redeploy.");
    if (response.status === 401) return jsonError("❌ ANTHROPIC_API_KEY is invalid or expired. Update it in Vercel settings.");
    if (response.status === 429) return jsonError("⏳ Rate limit reached. Wait a moment and try again.");
    if (response.status === 529) return jsonError("Anthropic servers are overloaded. Please try again in a few seconds.");
    return jsonError(`Anthropic API returned ${response.status}. Please try again.`);
  }

  // 6. Parse Anthropic response
  let aiData: { content?: Array<{ type: string; text: string }> };
  try {
    aiData = await response.json();
  } catch {
    return jsonError("Could not parse Anthropic response. Please try again.");
  }

  const raw = aiData.content?.find(b => b.type === "text")?.text ?? "";

  // 7. Strip any accidental markdown fences
  const clean = raw
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  // 8. Parse the JSON the AI returned
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(clean);
  } catch {
    console.error("AI JSON parse failed. Raw:", raw.slice(0, 400));
    return jsonError("AI returned unexpected format. Please try again.");
  }

  // 9. Validate required fields
  if (typeof parsed.tossup !== "string" || !parsed.tossup ||
      typeof parsed.answer  !== "string" || !parsed.answer) {
    return jsonError("AI response was missing required fields. Please try again.");
  }

  return NextResponse.json(parsed, {
    headers: { "Content-Type": "application/json" },
  });
}
