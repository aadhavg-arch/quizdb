// app/api/judge/route.ts
// CHANGED: handles pipe-joined voice alternatives for phonetic near-match judging

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

  // ── No answer at all → 0 pts ──────────────────────────────────────────────
  if (!studentAnswer) {
    return NextResponse.json({ correct: false, points: 0, reason: "No answer given — time ran out." });
  }

  // CHANGED: Voice recognition sends up to 5 alternatives joined by "|".
  // Split them so we can check each one independently.
  const alternatives = studentAnswer.split("|").map(s => s.trim()).filter(Boolean);
  const primaryAnswer = alternatives[0]; // shown to student in UI

  // ── Step 1: Try QB Reader check-answer for EACH alternative ──────────────
  // Accept on first "accept" directive found across all alternatives.
  let directive = "reject";
  let acceptedAlt = "";

  for (const alt of alternatives) {
    try {
      const u = new URL("https://www.qbreader.org/api/check-answer");
      u.searchParams.set("answerline",  answer);
      u.searchParams.set("givenAnswer", alt);
      const cr = await fetch(u.toString(), { signal: AbortSignal.timeout(5000) });
      if (cr.ok) {
        const cd = await cr.json() as { directive?: string };
        const d = cd.directive ?? "reject";
        if (d === "accept") { directive = "accept"; acceptedAlt = alt; break; }
        if (d === "prompt" && directive === "reject") directive = "prompt"; // keep best
      }
    } catch { /* fall through */ }
  }

  if (directive === "accept") {
    const note = acceptedAlt !== primaryAnswer ? ` (matched: "${acceptedAlt}")` : "";
    return NextResponse.json({ correct: true, points: basePts, reason: `Correct!${note}` });
  }

  // ── Step 2: Anthropic phonetic + fuzzy judge ──────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback: simple normalised string match across all alternatives
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    const na = norm(answer);
    const ok = alternatives.some(alt => {
      const ns = norm(alt);
      return na === ns || na.includes(ns) || ns.includes(na.split(" ").slice(-1)[0]);
    });
    return NextResponse.json({ correct: ok, points: ok ? basePts : 0, reason: ok ? "Correct!" : "Incorrect." });
  }

  // CHANGED: pass ALL alternatives to the AI so it can accept near-pronunciations
  // (e.g. "Napoleon Bonaparte" heard as "Napoleon Bone apart" → still correct)
  const altList = alternatives.map((a, i) => `  Alternative ${i+1}: "${a}"`).join("\n");

  const prompt = `You are a strict but fair quiz bowl judge for a middle school competition.

Correct answer: "${answer}"
Student's voice recognition produced these alternatives (most likely first):
${altList}
QB Reader directive for the primary alternative: "${directive}" (prompt = needs specificity, reject = wrong)

Judge whether ANY of the alternatives should receive credit. Rules:
1. PHONETIC NEAR-MATCH: If any alternative sounds like the correct answer when spoken aloud, even with speech recognition errors (e.g. "Tolstoy" heard as "tall story", "Tchaikovsky" as "chai coffee", "Napoleon" as "Nap oleon"), accept it.
2. TYPOS / RECOGNITION ERRORS: Common speech-to-text mishearings of proper nouns should be accepted.
3. PARTIAL: Last name alone is usually sufficient for a person's name.
4. VAGUE: If "prompt" and the alternative is clearly the right topic, accept at middle school level.
5. WRONG: If none of the alternatives are phonetically or semantically close, reject.

Award ${basePts} points if correct, 0 if not.

Return ONLY valid JSON, nothing else:
{"correct":boolean,"points":number,"reason":"one friendly sentence for the student"}`;

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
    const raw   = aid.content?.find(b => b.type === "text")?.text ?? "";
    const clean = raw.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(clean) as { correct: boolean; points: number; reason: string };
    return NextResponse.json(parsed);
  } catch (e) {
    console.error("Judge AI error:", e);
    return NextResponse.json({ correct: false, points: 0, reason: "Could not judge answer — marked incorrect." });
  }
}
