"use client";

// ============================================================
// NAQT Middle School Quiz Bowl Training App
// AI-powered questions, TTS reading, timer, scoring
// ============================================================

// FIX 1: Removed duplicate useState import — was imported twice which
// causes a TypeScript compile error. Merged into one import statement.
import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────
interface Question {
  tossup: string;
  answer: string;
  alternates: string[];
  clue: string;
}

// ── NAQT MS Distribution: subjects & sub-areas ───────────────
const SUBJECTS = [
  { label: "History",     sub: ["American History", "World History", "Ancient History", "Asian History", "European History"] },
  { label: "Science",     sub: ["Biology", "Chemistry", "Physics", "Earth & Space Science", "Math / Computation"] },
  { label: "Literature",  sub: ["American Literature", "British Literature", "World Literature", "Young Adult / Children's Literature"] },
  { label: "Fine Arts",   sub: ["Classical Music", "Visual Arts / Painting", "Architecture", "Dance & Theater"] },
  { label: "Geography",   sub: ["US Geography", "World Geography", "Physical Geography"] },
  { label: "Mathematics", sub: ["Computation", "Algebra", "Geometry", "Number Theory"] },
  { label: "Mythology",   sub: ["Greek Mythology", "Roman Mythology", "Norse Mythology", "World Mythology"] },
  { label: "Current Events", sub: ["US Current Events", "World Current Events", "Science & Tech News"] },
  { label: "Television & Pop Culture", sub: ["Animated Series", "Live-Action Series", "Movies", "Music & Pop Culture"] },
  { label: "Sports",      sub: ["Olympics", "Major League Sports", "College Sports", "Sports History"] },
  { label: "Politics & Government", sub: ["US Government & Civics", "US Politics", "World Politics", "US Presidents"] },
];

const DIFFICULTIES = ["Middle School Standard", "MSNCT (Harder)", "Review (Easier)"];

// ── Colour palette ────────────────────────────────────────────
const C = {
  bg:        "#05080f",
  panel:     "#0d1220",
  border:    "#1e2d4a",
  accent:    "#3b82f6",
  accentGlow:"#3b82f640",
  gold:      "#f59e0b",
  goldGlow:  "#f59e0b30",
  green:     "#10b981",
  red:       "#ef4444",
  text:      "#e2e8f0",
  muted:     "#64748b",
  reading:   "#38bdf8",
};

// ── Inline styles ─────────────────────────────────────────────
// FIX 2: Added explicit TypeScript types to all style functions
// to prevent "implicit any" errors in strict mode.
const S = {
  root: {
    minHeight: "100vh",
    background: C.bg,
    color: C.text,
    fontFamily: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
    padding: "0 0 60px",
    backgroundImage:
      "radial-gradient(ellipse at 10% 0%, #0f1f3d55 0%, transparent 55%), radial-gradient(ellipse at 90% 100%, #0a1a3055 0%, transparent 55%)",
  } as React.CSSProperties,

  header: {
    borderBottom: `1px solid ${C.border}`,
    padding: "18px 32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "rgba(13,18,32,0.9)",
    backdropFilter: "blur(8px)",
    position: "sticky",
    top: 0,
    zIndex: 50,
  } as React.CSSProperties,

  headerTitle: {
    margin: 0,
    fontSize: "1.25rem",
    fontWeight: "normal",
    letterSpacing: "0.06em",
    color: C.text,
  } as React.CSSProperties,

  // FIX 2a: Explicit (bg: string, color: string) param types
  badge: (bg: string, color: string): React.CSSProperties => ({
    background: bg,
    color: color,
    padding: "3px 10px",
    borderRadius: "20px",
    fontSize: "0.72rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    fontFamily: "monospace",
  }),

  container: {
    maxWidth: 820,
    margin: "0 auto",
    padding: "28px 20px",
  } as React.CSSProperties,

  card: {
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: 16,
    padding: "28px 32px",
    marginBottom: 20,
  } as React.CSSProperties,

  label: {
    display: "block",
    fontSize: "0.7rem",
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    color: C.muted,
    marginBottom: 8,
  } as React.CSSProperties,

  select: {
    width: "100%",
    background: "#0a0f1e",
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    color: C.text,
    padding: "10px 14px",
    fontSize: "0.95rem",
    fontFamily: "inherit",
    appearance: "none",
    cursor: "pointer",
    outline: "none",
  } as React.CSSProperties,

  // FIX 2b: Explicit (variant: string, disabled: boolean) param types
  btn: (variant: string = "primary", disabled: boolean = false): React.CSSProperties => ({
    padding: "11px 24px",
    borderRadius: 10,
    border: "none",
    fontSize: "0.88rem",
    fontFamily: "'Palatino Linotype', serif",
    letterSpacing: "0.08em",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 0.18s",
    opacity: disabled ? 0.45 : 1,
    fontWeight: "bold",
    ...(variant === "primary" && {
      background: `linear-gradient(135deg, #2563eb, #3b82f6)`,
      color: "#fff",
      boxShadow: `0 0 20px ${C.accentGlow}`,
    }),
    ...(variant === "gold" && {
      background: `linear-gradient(135deg, #d97706, #f59e0b)`,
      color: "#0a0a0f",
      boxShadow: `0 0 20px ${C.goldGlow}`,
    }),
    ...(variant === "ghost" && {
      background: "rgba(255,255,255,0.05)",
      color: C.muted,
      border: `1px solid ${C.border}`,
    }),
    ...(variant === "danger" && {
      background: "rgba(239,68,68,0.15)",
      color: C.red,
      border: `1px solid rgba(239,68,68,0.3)`,
    }),
    ...(variant === "green" && {
      background: "rgba(16,185,129,0.15)",
      color: C.green,
      border: `1px solid rgba(16,185,129,0.3)`,
    }),
  }),

  input: {
    width: "100%",
    background: "#0a0f1e",
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    color: C.text,
    padding: "12px 16px",
    fontSize: "1rem",
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  } as React.CSSProperties,

  // FIX 2c: Explicit (color: string) param type
  scorePill: (color: string): React.CSSProperties => ({
    background: `${color}18`,
    border: `1px solid ${color}50`,
    borderRadius: 12,
    padding: "6px 18px",
    textAlign: "center",
    minWidth: 90,
  }),
};

// ── Timer hook ────────────────────────────────────────────────
function useTimer() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  // FIX 3: Typed useRef — ReturnType<typeof setInterval> | null
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    setElapsed(0);
    setRunning(true);
  }, []);
  const stop  = useCallback(() => setRunning(false), []);
  const reset = useCallback(() => { setRunning(false); setElapsed(0); }, []);

  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (ref.current !== null) clearInterval(ref.current);
    }
    return () => { if (ref.current !== null) clearInterval(ref.current); };
  }, [running]);

  return { elapsed, running, start, stop, reset };
}

// ── Main App ──────────────────────────────────────────────────
export default function NAQTQuizBowl() {
  const [subject,    setSubject]    = useState(SUBJECTS[0].label);
  const [subArea,    setSubArea]    = useState(SUBJECTS[0].sub[0]);
  const [difficulty, setDifficulty] = useState(DIFFICULTIES[0]);
  const subjectObj = SUBJECTS.find((s) => s.label === subject);

  // FIX 3a: Typed useState — Question | null
  const [question, setQuestion] = useState<Question | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const [userAnswer, setUserAnswer] = useState("");
  // FIX 3b: Typed result state
  const [result,   setResult]   = useState<"correct" | "wrong" | null>(null);
  const [answered, setAnswered] = useState(false);

  const [isReading,     setIsReading]     = useState(false);
  const [readingStopped, setReadingStopped] = useState(false);

  // FIX 3c: Typed refs
  const synthRef  = useRef<SpeechSynthesisUtterance | null>(null);
  const answerRef = useRef<HTMLInputElement>(null);

  const timer = useTimer();

  const [score,         setScore]         = useState(0);
  const [questionCount, setQuestionCount] = useState(0);
  const [correctCount,  setCorrectCount]  = useState(0);

  // ── Subject change ──────────────────────────────────────────
  useEffect(() => {
    const obj = SUBJECTS.find((s) => s.label === subject);
    if (obj) setSubArea(obj.sub[0]);
  }, [subject]);

  // ── Stop TTS ────────────────────────────────────────────────
  const stopReading = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsReading(false);
  }, []);

  // ── Spacebar buzz-in listener ───────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" && isReading && !answered) {
        e.preventDefault();
        stopReading();
        timer.start();
        setReadingStopped(true);
        setTimeout(() => answerRef.current?.focus(), 100);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isReading, answered, stopReading, timer]);

  // ── Cleanup TTS on unmount ──────────────────────────────────
  useEffect(() => () => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // ── Fetch question from Claude API ──────────────────────────
  const fetchQuestion = async () => {
    setLoading(true);
    setError("");
    setQuestion(null);
    setResult(null);
    setAnswered(false);
    setUserAnswer("");
    setReadingStopped(false);
    stopReading();
    timer.reset();

    const prompt = `You are an expert NAQT question writer for middle school quiz bowl.

Generate ONE tossup-style question for:
- Subject: ${subject}
- Sub-area: ${subArea}
- Difficulty: ${difficulty}

Rules:
1. Pyramid structure: harder clues first, easier clues last
2. Place "(*)" where a good player should buzz in
3. End with "For 10 points, identify [ANSWER]"
4. Provide 1-2 alternate acceptable answers

Respond ONLY as JSON (no markdown, no code fences):
{
  "tossup": "Full tossup text with (*) marker",
  "answer": "Primary answer",
  "alternates": ["alt1", "alt2"],
  "clue": "One sentence explaining the key fact that identifies this answer"
}`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      const raw  = (data.content as Array<{ type: string; text: string }>)
        ?.find((b) => b.type === "text")?.text || "";
      const clean  = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean) as Question;
      setQuestion(parsed);
      setQuestionCount((c) => c + 1);
    } catch {
      setError("Failed to generate question. Please try again.");
    }
    setLoading(false);
  };

  // ── Read question aloud ──────────────────────────────────────
  const readQuestion = () => {
    if (!question || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(
      question.tossup.replace(/\(\*\)/g, "... ")
    );
    utter.rate  = 0.92;
    utter.pitch = 1;
    utter.onend = () => {
      setIsReading(false);
      if (!answered) {
        timer.start();
        setReadingStopped(true);
        setTimeout(() => answerRef.current?.focus(), 100);
      }
    };
    utter.onerror = () => setIsReading(false);
    synthRef.current = utter;
    window.speechSynthesis.speak(utter);
    setIsReading(true);
    setReadingStopped(false);
  };

  // ── Submit answer ────────────────────────────────────────────
  const submitAnswer = () => {
    if (!question || answered || !userAnswer.trim()) return;
    timer.stop();
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    const ua = normalize(userAnswer);
    const correct =
      normalize(question.answer) === ua ||
      (question.alternates || []).some((a) => normalize(a) === ua) ||
      normalize(question.answer).includes(ua) ||
      ua.includes(normalize(question.answer).split(" ")[0]);

    setResult(correct ? "correct" : "wrong");
    setAnswered(true);
    if (correct) {
      setScore((s) => s + 10);
      setCorrectCount((c) => c + 1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") submitAnswer();
  };

  // ── Render tossup with BUZZ marker ───────────────────────────
  const renderTossup = (text: string) => {
    const parts = text.split("(*)");
    return parts.map((part, i) => (
      <span key={i}>
        {part}
        {i < parts.length - 1 && (
          <span style={{
            background: C.goldGlow, color: C.gold,
            padding: "1px 6px", borderRadius: 4,
            fontWeight: "bold", fontSize: "0.85em",
            border: `1px solid ${C.gold}60`, margin: "0 2px",
          }}>★ BUZZ</span>
        )}
      </span>
    ));
  };

  const accuracy = questionCount > 0 ? Math.round((correctCount / questionCount) * 100) : 0;

  // ── Render ───────────────────────────────────────────────────
  return (
    <div style={S.root}>
      {/* Header */}
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: "1.4rem" }}>🏆</span>
          <h1 style={S.headerTitle}>
            NAQT <span style={{ color: C.accent }}>Middle School</span> Quiz Bowl
          </h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {[
            { val: score,           label: "POINTS", color: C.gold  },
            { val: `${accuracy}%`,  label: "ACC",    color: C.green },
            { val: questionCount,   label: "Q's",    color: C.accent},
          ].map(({ val, label, color }) => (
            <div key={label} style={S.scorePill(color)}>
              <div style={{ fontSize: "1.2rem", fontWeight: "bold", color }}>{val}</div>
              <div style={{ fontSize: "0.6rem", color: C.muted, letterSpacing: "0.15em" }}>{label}</div>
            </div>
          ))}
        </div>
      </header>

      <div style={S.container}>

        {/* Config Card */}
        <div style={S.card}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div>
              <label style={S.label}>Subject</label>
              <select style={S.select} value={subject} onChange={(e) => setSubject(e.target.value)}>
                {SUBJECTS.map((s) => <option key={s.label} value={s.label}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Sub-Area</label>
              <select style={S.select} value={subArea} onChange={(e) => setSubArea(e.target.value)}>
                {(subjectObj?.sub || []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Difficulty</label>
              <select style={S.select} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <button
            style={{ ...S.btn("gold", loading), width: "100%", fontSize: "1rem", padding: "14px" }}
            onClick={fetchQuestion}
            disabled={loading}
          >
            {loading ? "⏳  Generating Question…" : "⚡  Generate New Tossup Question"}
          </button>
          {error && <p style={{ color: C.red, fontSize: "0.85rem", marginTop: 10, textAlign: "center" }}>{error}</p>}
        </div>

        {/* Question Card */}
        {question && (
          <div style={{ ...S.card, border: `1px solid ${isReading ? C.reading : C.border}`, transition: "border-color 0.4s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={S.badge(C.accentGlow, C.accent)}>{subject}</span>
                <span style={S.badge("rgba(255,255,255,0.06)", C.muted)}>{subArea}</span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {(timer.running || timer.elapsed > 0) && (
                  <div style={{
                    fontFamily: "monospace", fontSize: "1.4rem",
                    color: timer.elapsed > 10 ? C.red : C.gold,
                    fontWeight: "bold", minWidth: 48, textAlign: "center",
                  }}>
                    {timer.elapsed}s
                  </div>
                )}
                {!answered && (
                  <button
                    style={S.btn(isReading ? "danger" : "primary")}
                    onClick={isReading
                      ? () => { stopReading(); timer.start(); setReadingStopped(true); answerRef.current?.focus(); }
                      : readQuestion}
                  >
                    {isReading ? "⏹ Stop (or Space)" : "🔊 Read Aloud"}
                  </button>
                )}
              </div>
            </div>

            {isReading && (
              <div style={{
                background: `${C.reading}15`, border: `1px solid ${C.reading}40`,
                borderRadius: 8, padding: "8px 14px", marginBottom: 14,
                fontSize: "0.82rem", color: C.reading, letterSpacing: "0.05em",
              }}>
                🎙 Reading… Press <kbd style={{ background: "#1e2d4a", padding: "1px 6px", borderRadius: 4 }}>SPACE</kbd> to buzz in!
              </div>
            )}

            <div style={{
              background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12, padding: "22px 26px", marginBottom: 22,
              lineHeight: 1.85, fontSize: "1.05rem", color: C.text,
            }}>
              {renderTossup(question.tossup)}
            </div>

            {(readingStopped || !isReading) && !answered && (
              <div>
                <label style={S.label}>Your Answer</label>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    ref={answerRef}
                    style={S.input}
                    placeholder="Type your answer and press Enter…"
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoComplete="off"
                  />
                  <button style={S.btn("primary", !userAnswer.trim())} onClick={submitAnswer} disabled={!userAnswer.trim()}>
                    Submit
                  </button>
                </div>
                <p style={{ fontSize: "0.75rem", color: C.muted, marginTop: 6 }}>
                  Press <strong>Enter</strong> to submit · Timer: {timer.elapsed}s
                </p>
              </div>
            )}

            {answered && (
              <div>
                <div style={{
                  background: result === "correct" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                  border: `1px solid ${result === "correct" ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`,
                  borderRadius: 10, padding: "14px 20px", marginBottom: 14,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: result === "correct" ? C.green : C.red }}>
                      {result === "correct" ? "✓ Correct! +10 points" : "✗ Incorrect — 0 points"}
                    </div>
                    <div style={{ fontSize: "0.85rem", color: C.muted, marginTop: 3 }}>
                      Your answer: <em style={{ color: C.text }}>{userAnswer}</em>
                      {" · "}Time: <strong style={{ color: C.gold }}>{timer.elapsed}s</strong>
                    </div>
                  </div>
                  <div style={{ fontSize: "2rem" }}>{result === "correct" ? "🏆" : "📚"}</div>
                </div>

                {result === "wrong" && (
                  <div style={{
                    background: "rgba(245,158,11,0.08)", border: `1px solid ${C.gold}40`,
                    borderRadius: 10, padding: "14px 20px", marginBottom: 14,
                  }}>
                    <div style={{ fontSize: "0.68rem", letterSpacing: "0.2em", color: C.gold, textTransform: "uppercase", marginBottom: 4 }}>
                      Correct Answer
                    </div>
                    <div style={{ fontSize: "1.15rem", color: C.gold, fontWeight: "bold" }}>{question.answer}</div>
                    {question.alternates?.length > 0 && (
                      <div style={{ fontSize: "0.8rem", color: C.muted, marginTop: 4 }}>
                        Also accepted: {question.alternates.join(", ")}
                      </div>
                    )}
                  </div>
                )}

                <div style={{
                  background: "rgba(59,130,246,0.08)", border: `1px solid ${C.accent}30`,
                  borderRadius: 10, padding: "14px 20px", marginBottom: 18,
                }}>
                  <div style={{ fontSize: "0.68rem", letterSpacing: "0.2em", color: C.accent, textTransform: "uppercase", marginBottom: 6 }}>
                    💡 Key Clue / Study Hint
                  </div>
                  <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.7, color: "#b0c4de" }}>{question.clue}</p>
                </div>

                <button style={{ ...S.btn("gold"), width: "100%", fontSize: "1rem", padding: "14px" }} onClick={fetchQuestion}>
                  ⚡ Next Question
                </button>
              </div>
            )}

            {!readingStopped && !isReading && !answered && (
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <button style={S.btn("ghost")} onClick={() => { setReadingStopped(true); answerRef.current?.focus(); }}>
                  Skip reading → Answer now
                </button>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!question && !loading && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted }}>
            <div style={{ fontSize: "4rem", marginBottom: 16, opacity: 0.4 }}>🎓</div>
            <p style={{ fontSize: "1.1rem", marginBottom: 6 }}>Select a subject and generate your first tossup!</p>
            <p style={{ fontSize: "0.85rem", color: "#374151" }}>
              NAQT-style pyramid questions · Press SPACE to buzz · 10 pts per correct answer
            </p>
          </div>
        )}

        {/* Score summary */}
        {questionCount > 0 && (
          <div style={{ ...S.card, display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            {[
              { label: "Total Points", val: score,           color: C.gold  },
              { label: "Questions",    val: questionCount,   color: C.accent },
              { label: "Correct",      val: correctCount,    color: C.green  },
              { label: "Accuracy",     val: `${accuracy}%`,  color: accuracy >= 70 ? C.green : accuracy >= 40 ? C.gold : C.red },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ textAlign: "center", padding: "8px 24px" }}>
                <div style={{ fontSize: "2rem", fontWeight: "bold", color }}>{val}</div>
                <div style={{ fontSize: "0.68rem", color: C.muted, letterSpacing: "0.18em", textTransform: "uppercase" }}>{label}</div>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center" }}>
              <button style={S.btn("ghost")} onClick={() => { setScore(0); setQuestionCount(0); setCorrectCount(0); }}>
                Reset Score
              </button>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div style={{ ...S.card, background: "rgba(13,18,32,0.5)" }}>
          <div style={{ fontSize: "0.68rem", letterSpacing: "0.2em", color: C.muted, textTransform: "uppercase", marginBottom: 12 }}>
            How to Use
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {[
              ["1. Select Subject",    "Pick subject + sub-area matching NAQT MS distribution"],
              ["2. Generate Question", "AI writes a real pyramid-style tossup question"],
              ["3. Listen & Buzz",     "Click Read Aloud, then press SPACE to buzz in early!"],
              ["4. Answer & Score",    "Type your answer — 10 pts if correct. Study the hint if wrong."],
            ].map(([title, desc]) => (
              <div key={title} style={{ padding: "10px 14px", background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
                <div style={{ fontSize: "0.78rem", color: C.accent, fontWeight: "bold", marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: "0.78rem", color: C.muted, lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
