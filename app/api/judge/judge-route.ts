// app/api/judge/route.ts  ← exact file path in your repo
// Two-step answer judging: QB Reader check-answer API, then Anthropic for fuzzy/typo matching

import { NextRequest, NextResponse } from "next/server";

function jsonErr(msg: string) {
  return NextResponse.json({ correct: false, points: 0, reason: msg }, { headers: { "Content-Type": "application/json" } });
}

export async function POST(req: NextRequest) {
  let answer = "", studentAnswer = "", isPower = false;
  try {
    const b = await req.json();
    answer        = (b.answer        ?? "").trim();
    studentAnswer = (b.studentAnswer ?? "").trim();
    isPower       = !!b.isPower;
  } catch {
    return jsonErr("Bad request body.");
  }

  const basePts = isPower ? 15 : 10;

  // ── Step 1: No answer at all → 0 pts ──
  if (!studentAnswer) {
    return NextResponse.json({ correct: false, points: 0, reason: "No answer given — time ran out." });
  }

  // ── Step 2: QB Reader check-answer (official fuzzy match) ──
  let directive = "reject";
  try {
    const u = new URL("https://www.qbreader.org/api/check-answer");
    u.searchParams.set("answerline",   answer);
    u.searchParams.set("givenAnswer",  studentAnswer);
    const cr = await fetch(u.toString(), { signal: AbortSignal.timeout(5000) });
    if (cr.ok) {
      const cd = await cr.json() as { directive?: string };
      directive = cd.directive ?? "reject";
    }
  } catch { /* fall through to Anthropic */ }

  if (directive === "accept") {
    return NextResponse.json({ correct: true, points: basePts, reason: "Correct! Well done." });
  }

  // ── Step 3: Anthropic fuzzy / typo judge ──
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback: simple normalised string match
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g," ").trim();
    const na = norm(answer), ns = norm(studentAnswer);
    const ok = na === ns || na.includes(ns) || ns.includes(na.split(" ").slice(-1)[0]);
    return NextResponse.json({ correct: ok, points: ok ? basePts : 0, reason: ok ? "Correct!" : "Incorrect." });
  }

  const prompt = `You are a strict but fair quiz bowl judge for a middle school competition.

Correct answer: "${answer}"
Student's answer: "${studentAnswer}"
QB Reader directive: "${directive}" (prompt = needs more specificity, reject = wrong)

Decide if the student should get credit. Consider:
- Minor typos / misspellings that sound the same when spoken aloud (e.g. "Einstien" for "Einstein" → accept)
- Common alternate names, abbreviations, or partial last names that clearly identify the answer
- "Prompt" means the student was vague — judge whether the vague answer still merits credit at middle school level
- "Reject" from QB Reader is a strong signal, override only for obvious typos

If the answer should be accepted: give ${basePts} points.
If it should be rejected: give 0 points.

Return ONLY valid JSON, nothing else:
{"correct":boolean,"points":number,"reason":"one short sentence for the student"}`;

  try {
    const air = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 150,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(8000),
    });

    const aid = await air.json() as { content?: Array<{ type: string; text: string }> };
    const raw  = aid.content?.find(b => b.type === "text")?.text ?? "";
    const clean = raw.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(clean) as { correct: boolean; points: number; reason: string };
    return NextResponse.json(parsed);
  } catch (e) {
    console.error("Judge AI error:", e);
    return NextResponse.json({ correct: false, points: 0, reason: "Could not judge answer — marked incorrect." });
  }
}
