// app/api/hint/route.ts
// Returns a "Clue Connection" hint explaining what the student should have known

import { NextRequest, NextResponse } from "next/server";

function jsonErr(msg: string) {
  return NextResponse.json({ hint: msg }, { headers: { "Content-Type": "application/json" } });
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return jsonErr("");

  let question = "", answer = "", category = "", subcategory = "",
      studentAnswer = "", correct = false;
  try {
    const b = await req.json();
    question       = b.question       ?? "";
    answer         = b.answer         ?? "";
    category       = b.category       ?? "";
    subcategory    = b.subcategory     ?? "";
    studentAnswer  = b.studentAnswer   ?? "";
    correct        = !!b.correct;
  } catch { return jsonErr(""); }

  const prompt = `You are a quiz bowl coach helping a middle school student understand a question they just attempted.

Question: ${question.replace(/\(\*\)/g, "[BUZZ POINT]")}
Correct answer: ${answer}
Category: ${category}${subcategory ? ` / ${subcategory}` : ""}
Student's answer: ${studentAnswer || "(no answer — time ran out)"}
Student was ${correct ? "CORRECT" : "INCORRECT"}.

Write a short, friendly "Clue Connection" explanation (3–5 sentences) that:
1. Names the KEY FACT or CONCEPT that unlocks this answer (the "aha" connection)
2. Points out the most important clue in the question text and why it leads to ${answer}
3. ${correct ? "Reinforces what the student did well and what to remember next time." : "Explains what the student likely confused it with and how to distinguish the two in future."}
4. Uses plain language a middle schooler can understand

Be concise, warm, and educational. Do NOT just restate the question. Focus on the insight.
Return ONLY the explanation text — no headers, no bullet points, no JSON, no preamble.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 250,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(12000),
    });

    const data = await res.json() as { content?: Array<{ type: string; text: string }> };
    const hint = data.content?.find(b => b.type === "text")?.text?.trim() ?? "";
    return NextResponse.json({ hint }, { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Hint API error:", e);
    return jsonErr("");
  }
}
