"use client";

// ============================================================
// NAQT Middle School Quiz Bowl — Full Featured Training App
// Voice answers · American TTS · Live quiz environment · Light theme
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────
interface Question {
  tossup: string;
  answer: string;
  alternates: string[];
  clue: string;
  powerClues: string[];
  category: string;
}

type Phase =
  | "idle"        // waiting to start
  | "reading"     // TTS reading the question
  | "buzzed"      // student buzzed in, timer running
  | "listening"   // voice recognition active
  | "answered"    // result shown
  | "loading";    // fetching question

// ── NAQT Subject Distribution ─────────────────────────────────
const SUBJECTS = [
  { label: "History",     sub: ["American History", "World History", "Ancient History", "Asian History", "European History"] },
  { label: "Science",     sub: ["Biology", "Chemistry", "Physics", "Earth & Space Science", "Computation"] },
  { label: "Literature",  sub: ["American Literature", "British Literature", "World Literature", "Young Adult Literature"] },
  { label: "Fine Arts",   sub: ["Classical Music", "Visual Arts", "Architecture", "Dance & Theater"] },
  { label: "Geography",   sub: ["US Geography", "World Geography", "Physical Geography"] },
  { label: "Mathematics", sub: ["Computation", "Algebra", "Geometry", "Number Theory"] },
  { label: "Mythology",   sub: ["Greek Mythology", "Roman Mythology", "Norse Mythology", "World Mythology"] },
  { label: "Current Events", sub: ["US Current Events", "World Current Events", "Science & Tech News"] },
  { label: "Pop Culture", sub: ["Animated Series", "Live-Action TV", "Movies", "Music"] },
  { label: "Sports",      sub: ["Olympics", "Major League Sports", "College Sports", "Sports History"] },
  { label: "Politics",    sub: ["US Government", "US Politics", "World Politics", "US Presidents"] },
];
const DIFFICULTIES = ["Middle School Standard", "MSNCT (Harder)", "Review (Easier)"];

// ── Colour palette — warm academic light theme ────────────────
const C = {
  bg:         "#faf7f2",
  bgCard:     "#ffffff",
  bgAlt:      "#f5f0e8",
  border:     "#e2d9cc",
  borderDark: "#c9bfb0",
  accent:     "#1d4ed8",
  accentLight:"#eff6ff",
  gold:       "#b45309",
  goldLight:  "#fef3c7",
  green:      "#15803d",
  greenLight: "#f0fdf4",
  red:        "#dc2626",
  redLight:   "#fef2f2",
  text:       "#1c1917",
  textMid:    "#57534e",
  textMuted:  "#a8a29e",
  reading:    "#0369a1",
  readingLight:"#f0f9ff",
  buzz:       "#7c3aed",
  buzzLight:  "#f5f3ff",
  shadow:     "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
  shadowMd:   "0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)",
};

// ── Voice / TTS helpers ───────────────────────────────────────
function getAmericanVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  // Priority: US English voices
  const preferred = [
    "Google US English",
    "Microsoft David Desktop",
    "Microsoft Zira Desktop",
    "Alex",
    "Samantha",
  ];
  for (const name of preferred) {
    const v = voices.find((v) => v.name === name);
    if (v) return v;
  }
  // Fallback: any en-US voice
  return voices.find((v) => v.lang === "en-US") || voices.find((v) => v.lang.startsWith("en")) || null;
}

// ── Timer hook ────────────────────────────────────────────────
function useTimer() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const start = useCallback(() => { setElapsed(0); setRunning(true); }, []);
  const stop  = useCallback(() => setRunning(false), []);
  const reset = useCallback(() => { setRunning(false); setElapsed(0); }, []);
  useEffect(() => {
    if (running) ref.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    else if (ref.current) clearInterval(ref.current);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [running]);
  return { elapsed, running, start, stop, reset };
}

// ── Main component ────────────────────────────────────────────
export default function NAQTQuizBowl() {
  // Config
  const [subject,    setSubject]    = useState(SUBJECTS[0].label);
  const [subArea,    setSubArea]    = useState(SUBJECTS[0].sub[0]);
  const [difficulty, setDifficulty] = useState(DIFFICULTIES[0]);
  const subjectObj = SUBJECTS.find((s) => s.label === subject);

  // Game state
  const [phase,    setPhase]    = useState<Phase>("idle");
  const [question, setQuestion] = useState<Question | null>(null);
  const [error,    setError]    = useState("");

  // Answer
  const [textAnswer,  setTextAnswer]  = useState("");
  const [voiceAnswer, setVoiceAnswer] = useState("");
  const [result,      setResult]      = useState<"correct" | "wrong" | null>(null);
  const [inputMode,   setInputMode]   = useState<"text" | "voice">("text");

  // POWER scoring — true when student buzzes BEFORE the (*) marker is read
  const [isPower,          setIsPower]          = useState(false);
  const [powerCount,       setPowerCount]       = useState(0);
  // Ref tracks in real-time whether TTS has passed the (*) position yet
  const powerMarkPassedRef = useRef<boolean>(false);
  // Char index in the TTS string where the (*) marker sits
  const powerMarkIndexRef  = useRef<number>(0);

  // Refs
  const answerRef    = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Timer
  const timer = useTimer();

  // Score
  const [score,         setScore]         = useState(0);
  const [questionCount, setQuestionCount] = useState(0);
  const [correctCount,  setCorrectCount]  = useState(0);

  // Live quiz log (conversation)
  const [log, setLog] = useState<{ role: "reader" | "student" | "judge"; text: string }[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  // ── Helpers ───────────────────────────────────────────────
  const addLog = useCallback((role: "reader" | "student" | "judge", text: string) => {
    setLog((l) => [...l, { role, text }]);
    setTimeout(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }), 50);
  }, []);

  useEffect(() => {
    const obj = SUBJECTS.find((s) => s.label === subject);
    if (obj) setSubArea(obj.sub[0]);
  }, [subject]);

  // Spacebar buzz-in
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" && phase === "reading") {
        e.preventDefault();
        buzzIn();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase]);

  // Cleanup TTS on unmount
  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    recognitionRef.current?.abort();
  }, []);

  // ── TTS speaker ───────────────────────────────────────────
  const speak = useCallback((text: string, onEnd?: () => void) => {
    window.speechSynthesis.cancel();
    // Wait for voices to load
    const doSpeak = () => {
      const utter = new SpeechSynthesisUtterance(text);
      const voice = getAmericanVoice();
      if (voice) utter.voice = voice;
      utter.lang  = "en-US";
      utter.rate  = 0.9;
      utter.pitch = 1.0;
      utter.volume = 1.0;
      if (onEnd) utter.onend = onEnd;
      window.speechSynthesis.speak(utter);
    };
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = doSpeak;
    } else {
      doSpeak();
    }
  }, []);

  // ── Fetch question ────────────────────────────────────────
  const fetchQuestion = async () => {
    setPhase("loading");
    setError("");
    setQuestion(null);
    setResult(null);
    setTextAnswer("");
    setVoiceAnswer("");
    setIsPower(false);
    powerMarkPassedRef.current = false;
    powerMarkIndexRef.current  = 0;
    setLog([]);
    timer.reset();
    window.speechSynthesis?.cancel();
    recognitionRef.current?.abort();

    try {
      const res = await fetch("/api/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, subArea, difficulty }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "API error");

      setQuestion(data);
      setQuestionCount((c) => c + 1);
      setPhase("reading");

      // Reader intro
      addLog("reader", `Next question. Category: ${subject} — ${subArea}.`);
      setTimeout(() => {
        addLog("reader", data.tossup.replace(/\(\*\)/g, "★"));
        readQuestion(data.tossup);
      }, 800);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg.includes("ANTHROPIC_API_KEY")
        ? "⚠️ API key not set. Add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables."
        : "Failed to generate question. Please try again.");
      setPhase("idle");
    }
  };

  // ── Read question aloud ───────────────────────────────────
  const readQuestion = (tossup: string) => {
    // POWER: find where (*) sits in the original tossup.
    // TTS text replaces (*) with "... " — offsets are equal up to that point.
    const powerPos = tossup.indexOf("(*)");
    powerMarkIndexRef.current  = powerPos >= 0 ? powerPos : Infinity;
    powerMarkPassedRef.current = powerPos < 0; // no marker → never a power buzz

    const text = tossup.replace(/\(\*\)/g, "... ");

    window.speechSynthesis.cancel();
    const doSpeak = () => {
      const utter = new SpeechSynthesisUtterance(text);
      const voice = getAmericanVoice();
      if (voice) utter.voice = voice;
      utter.lang = "en-US"; utter.rate = 0.9; utter.pitch = 1.0; utter.volume = 1.0;

      // Track reading position word-by-word to detect when (*) is passed
      utter.addEventListener("boundary", (e: SpeechSynthesisEvent) => {
        if (!powerMarkPassedRef.current && e.charIndex >= powerMarkIndexRef.current) {
          powerMarkPassedRef.current = true;
        }
      });

      utter.onend = () => {
        setPhase("buzzed");
        timer.start();
        addLog("reader", "Time is up — please answer now.");
        setTimeout(() => answerRef.current?.focus(), 100);
      };
      window.speechSynthesis.speak(utter);
    };
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = doSpeak;
    } else {
      doSpeak();
    }
  };

  // ── Buzz in ───────────────────────────────────────────────
  const buzzIn = useCallback(() => {
    window.speechSynthesis?.cancel();

    // POWER: student buzzed before (*) was read → 15 pts if correct
    const power = !powerMarkPassedRef.current;
    setIsPower(power);

    setPhase("buzzed");
    timer.start();

    if (power) {
      addLog("reader", "⚡ POWER BUZZ! Answer before the marker — 15 points if correct!");
      speak("Power buzz! Go ahead, 15 points if correct.");
    } else {
      addLog("reader", "Buzzer! Go ahead — you have 5 seconds.");
      speak("Buzzer! Go ahead.");
    }

    setTimeout(() => {
      if (inputMode === "voice") startVoiceAnswer();
      else answerRef.current?.focus();
    }, 600);
  }, [inputMode, speak]);

  // ── Voice recognition ─────────────────────────────────────
  const startVoiceAnswer = () => {
    const SR = (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;

    if (!SR) {
      addLog("judge", "Voice recognition not supported in this browser. Please type your answer.");
      setInputMode("text");
      answerRef.current?.focus();
      return;
    }
    const recog = new SR();
    recog.lang = "en-US";
    recog.interimResults = false;
    recog.maxAlternatives = 3;
    recognitionRef.current = recog;
    setPhase("listening");
    addLog("reader", "🎤 Listening… speak your answer now.");

    recog.onresult = (e) => {
      const heard = e.results[0][0].transcript;
      setVoiceAnswer(heard);
      addLog("student", `"${heard}"`);
      setPhase("buzzed");
      submitAnswer(heard);
    };
    recog.onerror = () => {
      addLog("judge", "Couldn't hear that. Please type your answer.");
      setPhase("buzzed");
      setInputMode("text");
      answerRef.current?.focus();
    };
    recog.start();
  };

  // ── Normalize for comparison ──────────────────────────────
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/^(the|a|an) /, "")
      .replace(/[^a-z0-9 ]/g, "")
      .trim();

  // ── Submit answer ─────────────────────────────────────────
  const submitAnswer = useCallback((ans?: string) => {
    if (!question) return;
    timer.stop();
    const ua = normalize(ans ?? textAnswer);
    if (!ua) return;

    const correct =
      normalize(question.answer) === ua ||
      (question.alternates || []).some((a) => normalize(a) === ua) ||
      normalize(question.answer).includes(ua) ||
      ua.includes(normalize(question.answer).split(" ").slice(-1)[0]);

    setResult(correct ? "correct" : "wrong");
    setPhase("answered");

    if (correct) {
      // POWER: 15 pts if buzzed before (*), 10 pts otherwise
      const pts = isPower ? 15 : 10;
      setScore((s) => s + pts);
      setCorrectCount((c) => c + 1);
      if (isPower) setPowerCount((p) => p + 1);

      const powerMsg = isPower ? "⚡ POWER! " : "";
      addLog("judge", `✅ ${powerMsg}Correct! The answer is "${question.answer}". ${pts} points!`);
      speak(isPower
        ? `Power! Correct! ${question.answer}. Fifteen points.`
        : `Correct! ${question.answer}. 10 points.`);
    } else {
      addLog("judge", `❌ Incorrect. The correct answer is "${question.answer}".`);
      addLog("judge", `💡 Remember: ${question.clue}`);
      speak(`That is incorrect. The correct answer is ${question.answer}. ${question.clue}`);
    }
  }, [question, textAnswer, isPower, timer, addLog, speak]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && textAnswer.trim()) {
      addLog("student", `"${textAnswer}"`);
      submitAnswer();
    }
  };

  // ── Render tossup with BUZZ marker ────────────────────────
  const renderTossup = (text: string) =>
    text.split("(*)").map((part, i, arr) => (
      <span key={i}>
        {part}
        {i < arr.length - 1 && (
          <span style={{ background: C.buzzLight, color: C.buzz, padding: "2px 7px",
            borderRadius: 4, fontWeight: 700, fontSize: "0.8em",
            border: `1px solid ${C.buzz}40`, margin: "0 3px" }}>
            ★ BUZZ HERE
          </span>
        )}
      </span>
    ));

  const accuracy = questionCount > 0 ? Math.round((correctCount / questionCount) * 100) : 0;

  // ── Phase badge ───────────────────────────────────────────
  const phaseBadge: Record<Phase, { label: string; bg: string; color: string }> = {
    idle:     { label: "Ready",    bg: C.bgAlt,       color: C.textMuted },
    loading:  { label: "Loading…", bg: C.accentLight,  color: C.accent   },
    reading:  { label: "🎙 Reading — Press SPACE to buzz!", bg: C.readingLight, color: C.reading },
    buzzed:   { label: isPower ? "⚡ POWER BUZZ — Answer for 15 pts!" : "⏱ Answer Now! — 10 pts",
                bg: isPower ? "#fdf4ff" : C.goldLight,
                color: isPower ? "#7c3aed" : C.gold },
    listening:{ label: isPower ? "🎤 Listening… POWER BUZZ active!" : "🎤 Listening…",
                bg: C.buzzLight, color: C.buzz },
    answered: { label: result === "correct"
                  ? (isPower ? "⚡ POWER — Correct! +15 pts" : "✅ Correct! +10 pts")
                  : "❌ Incorrect",
                bg: result === "correct" ? (isPower ? "#fdf4ff" : C.greenLight) : C.redLight,
                color: result === "correct" ? (isPower ? "#7c3aed" : C.green) : C.red },
  };
  const badge = phaseBadge[phase];

  // ── Styles ────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: C.bgCard, border: `1px solid ${C.border}`,
    borderRadius: 14, padding: "24px 28px", marginBottom: 18,
    boxShadow: C.shadow,
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text,
      fontFamily: "'Georgia', 'Times New Roman', serif",
      backgroundImage: "radial-gradient(ellipse at 80% 0%, #e0eaff44 0%, transparent 60%)" }}>

      {/* ── Top bar ── */}
      <header style={{ background: C.bgCard, borderBottom: `1px solid ${C.border}`,
        padding: "14px 32px", display: "flex", alignItems: "center",
        justifyContent: "space-between", boxShadow: C.shadow,
        position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: "1.6rem" }}>🏆</span>
          <div>
            <div style={{ fontWeight: "bold", fontSize: "1.1rem", letterSpacing: "0.03em" }}>
              NAQT <span style={{ color: C.accent }}>Quiz Bowl</span> Trainer
            </div>
            <div style={{ fontSize: "0.7rem", color: C.textMuted, letterSpacing: "0.12em",
              textTransform: "uppercase" }}>Middle School Series</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { val: score,          label: "Points",   color: C.gold   },
            { val: `${accuracy}%`, label: "Accuracy", color: C.accent },
            { val: questionCount,  label: "Asked",    color: C.textMid},
          ].map(({ val, label, color }) => (
            <div key={label} style={{ textAlign: "center", padding: "6px 16px",
              background: C.bgAlt, borderRadius: 10, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: "1.3rem", fontWeight: "bold", color, lineHeight: 1 }}>{val}</div>
              <div style={{ fontSize: "0.62rem", color: C.textMuted, textTransform: "uppercase",
                letterSpacing: "0.13em" }}>{label}</div>
            </div>
          ))}
        </div>
      </header>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 20px" }}>

        {/* ── Phase status banner ── */}
        <div style={{ background: badge.bg, border: `1px solid ${badge.color}30`,
          borderRadius: 10, padding: "10px 18px", marginBottom: 18,
          display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: "bold", color: badge.color, fontSize: "0.95rem" }}>
            {badge.label}
          </div>
          {phase === "reading" && (
            <div style={{ fontSize: "0.8rem", color: C.textMid, marginLeft: "auto" }}>
              or click <strong>Stop & Buzz</strong> button below
            </div>
          )}
        </div>

        {/* ── Config card ── */}
        <div style={card}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 16 }}>
            {[
              { lbl: "Subject",    val: subject,    opts: SUBJECTS.map(s => s.label), set: setSubject },
              { lbl: "Sub-Area",   val: subArea,    opts: subjectObj?.sub || [],       set: setSubArea },
              { lbl: "Difficulty", val: difficulty, opts: DIFFICULTIES,                set: setDifficulty },
            ].map(({ lbl, val, opts, set }) => (
              <div key={lbl}>
                <label style={{ display: "block", fontSize: "0.65rem", letterSpacing: "0.18em",
                  textTransform: "uppercase", color: C.textMuted, marginBottom: 5 }}>{lbl}</label>
                <select value={val} onChange={(e) => set(e.target.value)} style={{
                  width: "100%", background: C.bgAlt, border: `1px solid ${C.border}`,
                  borderRadius: 8, color: C.text, padding: "9px 12px",
                  fontSize: "0.9rem", fontFamily: "inherit", cursor: "pointer", outline: "none" }}>
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>

          {/* Input mode toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: "0.75rem", color: C.textMuted, textTransform: "uppercase",
              letterSpacing: "0.12em" }}>Answer by:</span>
            {(["text", "voice"] as const).map((m) => (
              <button key={m} onClick={() => setInputMode(m)} style={{
                padding: "5px 14px", borderRadius: 20, border: `1px solid ${inputMode === m ? C.accent : C.border}`,
                background: inputMode === m ? C.accentLight : C.bgAlt,
                color: inputMode === m ? C.accent : C.textMid,
                fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit",
                fontWeight: inputMode === m ? "bold" : "normal" }}>
                {m === "text" ? "⌨️ Typing" : "🎤 Voice"}
              </button>
            ))}
          </div>

          <button onClick={fetchQuestion} disabled={phase === "loading"}
            style={{ width: "100%", padding: "13px", borderRadius: 10, border: "none",
              background: phase === "loading" ? C.bgAlt : C.accent,
              color: phase === "loading" ? C.textMuted : "#fff",
              fontSize: "1rem", fontFamily: "inherit", fontWeight: "bold",
              letterSpacing: "0.05em", cursor: phase === "loading" ? "not-allowed" : "pointer",
              boxShadow: phase === "loading" ? "none" : C.shadowMd, transition: "all 0.2s" }}>
            {phase === "loading" ? "⏳ Generating Question…" : "⚡ Generate New Question"}
          </button>
          {error && (
            <div style={{ marginTop: 10, padding: "10px 14px", background: C.redLight,
              border: `1px solid ${C.red}30`, borderRadius: 8, color: C.red, fontSize: "0.85rem" }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Question card ── */}
        {question && (
          <div style={{ ...card, border: `1px solid ${phase === "reading" ? C.reading : phase === "buzzed" || phase === "listening" ? C.gold : C.border}`, transition: "border-color 0.3s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ background: C.accentLight, color: C.accent, padding: "3px 10px",
                  borderRadius: 20, fontSize: "0.7rem", letterSpacing: "0.1em",
                  textTransform: "uppercase", fontFamily: "monospace" }}>{subject}</span>
                <span style={{ background: C.bgAlt, color: C.textMid, padding: "3px 10px",
                  borderRadius: 20, fontSize: "0.7rem", letterSpacing: "0.1em",
                  textTransform: "uppercase", fontFamily: "monospace" }}>{subArea}</span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {(timer.running || timer.elapsed > 0) && (
                  <div style={{ fontFamily: "monospace", fontSize: "1.5rem", fontWeight: "bold",
                    color: timer.elapsed > 5 ? C.red : C.gold, minWidth: 52, textAlign: "center" }}>
                    {timer.elapsed}s
                  </div>
                )}
                {phase === "reading" && (
                  <button onClick={buzzIn} style={{
                    padding: "8px 18px", borderRadius: 8, border: `2px solid ${C.buzz}`,
                    background: C.buzzLight, color: C.buzz, fontSize: "0.88rem",
                    fontFamily: "inherit", fontWeight: "bold", cursor: "pointer" }}>
                    ⚡ Stop & Buzz In
                  </button>
                )}
              </div>
            </div>

            {/* Tossup text */}
            <div style={{ background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 10,
              padding: "20px 24px", marginBottom: 18, lineHeight: 1.9,
              fontSize: "1.05rem", color: C.text }}>
              {renderTossup(question.tossup)}
            </div>

            {/* Answer area */}
            {(phase === "buzzed") && inputMode === "text" && (
              <div>
                <label style={{ display: "block", fontSize: "0.65rem", letterSpacing: "0.18em",
                  textTransform: "uppercase", color: C.textMuted, marginBottom: 6 }}>
                  Your Answer
                </label>
                <div style={{ display: "flex", gap: 10 }}>
                  <input ref={answerRef} value={textAnswer}
                    onChange={(e) => setTextAnswer(e.target.value)}
                    onKeyDown={handleKeyDown} autoComplete="off" autoFocus
                    placeholder="Type answer and press Enter…"
                    style={{ flex: 1, background: C.bgAlt, border: `2px solid ${C.accent}`,
                      borderRadius: 8, color: C.text, padding: "11px 14px",
                      fontSize: "1rem", fontFamily: "inherit", outline: "none" }} />
                  <button onClick={() => { addLog("student", `"${textAnswer}"`); submitAnswer(); }}
                    disabled={!textAnswer.trim()}
                    style={{ padding: "11px 22px", borderRadius: 8, border: "none",
                      background: C.accent, color: "#fff", fontFamily: "inherit",
                      fontWeight: "bold", cursor: textAnswer.trim() ? "pointer" : "not-allowed",
                      opacity: textAnswer.trim() ? 1 : 0.5 }}>
                    Submit
                  </button>
                </div>
                <p style={{ fontSize: "0.75rem", color: C.textMuted, marginTop: 5 }}>
                  Press Enter to submit · {timer.elapsed}s elapsed
                </p>
              </div>
            )}

            {phase === "buzzed" && inputMode === "voice" && (
              <button onClick={startVoiceAnswer} style={{
                width: "100%", padding: "14px", borderRadius: 10, border: `2px solid ${C.buzz}`,
                background: C.buzzLight, color: C.buzz, fontSize: "1rem",
                fontFamily: "inherit", fontWeight: "bold", cursor: "pointer" }}>
                🎤 Tap to Speak Your Answer
              </button>
            )}

            {phase === "listening" && (
              <div style={{ textAlign: "center", padding: "20px",
                background: C.buzzLight, borderRadius: 10, border: `2px solid ${C.buzz}` }}>
                <div style={{ fontSize: "2rem", marginBottom: 8 }}>🎤</div>
                <div style={{ color: C.buzz, fontWeight: "bold" }}>Listening for your answer…</div>
                <div style={{ color: C.textMuted, fontSize: "0.85rem", marginTop: 4 }}>Speak clearly into your microphone</div>
              </div>
            )}

            {/* Result */}
            {phase === "answered" && (
              <div>
                <div style={{ background: result === "correct"
                    ? (isPower ? "#fdf4ff" : C.greenLight) : C.redLight,
                  border: `1px solid ${result === "correct"
                    ? (isPower ? "#d8b4fe" : C.green + "40") : C.red + "40"}`,
                  borderRadius: 10, padding: "14px 20px", marginBottom: 14,
                  display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    {/* POWER badge */}
                    {result === "correct" && isPower && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 5,
                        background: "#7c3aed", color: "#fff", padding: "2px 10px",
                        borderRadius: 20, fontSize: "0.72rem", fontWeight: "bold",
                        letterSpacing: "0.12em", textTransform: "uppercase",
                        marginBottom: 6 }}>
                        ⚡ POWER — Early Buzz!
                      </div>
                    )}
                    <div style={{ fontSize: "1.1rem", fontWeight: "bold",
                      color: result === "correct" ? (isPower ? "#7c3aed" : C.green) : C.red }}>
                      {result === "correct"
                        ? (isPower ? "✓ Correct! +15 points (Power)" : "✓ Correct! +10 points")
                        : "✗ Incorrect — 0 points"}
                    </div>
                    <div style={{ fontSize: "0.85rem", color: C.textMid, marginTop: 3 }}>
                      You answered: <em>"{voiceAnswer || textAnswer}"</em>
                      {" · "}Time: <strong style={{ color: C.gold }}>{timer.elapsed}s</strong>
                    </div>
                  </div>
                  <div style={{ fontSize: "2.2rem" }}>
                    {result === "correct" ? (isPower ? "⚡" : "🏆") : "📖"}
                  </div>
                </div>

                {result === "wrong" && (
                  <div style={{ background: C.goldLight, border: `1px solid ${C.gold}40`,
                    borderRadius: 10, padding: "14px 20px", marginBottom: 14 }}>
                    <div style={{ fontSize: "0.65rem", letterSpacing: "0.2em", color: C.gold,
                      textTransform: "uppercase", marginBottom: 5 }}>Correct Answer</div>
                    <div style={{ fontSize: "1.2rem", color: C.gold, fontWeight: "bold" }}>
                      {question.answer}
                    </div>
                    {question.alternates?.length > 0 && (
                      <div style={{ fontSize: "0.8rem", color: C.textMid, marginTop: 3 }}>
                        Also accepted: {question.alternates.join(", ")}
                      </div>
                    )}
                  </div>
                )}

                {/* Key clue */}
                <div style={{ background: C.accentLight, border: `1px solid ${C.accent}30`,
                  borderRadius: 10, padding: "14px 20px", marginBottom: 14 }}>
                  <div style={{ fontSize: "0.65rem", letterSpacing: "0.2em", color: C.accent,
                    textTransform: "uppercase", marginBottom: 6 }}>💡 Key Clue</div>
                  <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.7, color: C.textMid }}>
                    {question.clue}
                  </p>
                </div>

                {/* Power clues */}
                {question.powerClues?.length > 0 && (
                  <div style={{ background: "#fffbeb", border: "1px solid #fde68a",
                    borderRadius: 10, padding: "14px 20px", marginBottom: 18 }}>
                    <div style={{ fontSize: "0.65rem", letterSpacing: "0.2em", color: "#92400e",
                      textTransform: "uppercase", marginBottom: 10 }}>⚡ Power Study — Know These Cold</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {question.powerClues.map((clue, i) => (
                        <li key={i} style={{ fontSize: "0.88rem", color: C.textMid,
                          lineHeight: 1.6, marginBottom: 4 }}>{clue}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <button onClick={fetchQuestion} style={{ width: "100%", padding: "13px",
                  borderRadius: 10, border: "none", background: C.accent, color: "#fff",
                  fontSize: "1rem", fontFamily: "inherit", fontWeight: "bold",
                  cursor: "pointer", boxShadow: C.shadowMd }}>
                  ⚡ Next Question
                </button>
              </div>
            )}

            {/* Skip to answer */}
            {phase === "reading" && (
              <div style={{ textAlign: "center", marginTop: 10 }}>
                <button onClick={() => {
                  window.speechSynthesis?.cancel();
                  setPhase("buzzed");
                  timer.start();
                  setTimeout(() => answerRef.current?.focus(), 100);
                }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: "6px 18px", color: C.textMuted, fontSize: "0.8rem",
                  fontFamily: "inherit", cursor: "pointer" }}>
                  Skip reading → Answer now
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Live quiz log ── */}
        {log.length > 0 && (
          <div style={card}>
            <div style={{ fontSize: "0.65rem", letterSpacing: "0.2em", color: C.textMuted,
              textTransform: "uppercase", marginBottom: 12 }}>📻 Live Quiz Room</div>
            <div ref={logRef} style={{ maxHeight: 220, overflowY: "auto",
              display: "flex", flexDirection: "column", gap: 8 }}>
              {log.map((entry, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ fontSize: "0.7rem", fontWeight: "bold", minWidth: 60,
                    textTransform: "uppercase", letterSpacing: "0.08em", paddingTop: 2,
                    color: entry.role === "reader" ? C.reading
                         : entry.role === "student" ? C.accent : C.green }}>
                    {entry.role === "reader" ? "📖 Reader" : entry.role === "student" ? "🙋 You" : "⚖️ Judge"}
                  </span>
                  <span style={{ fontSize: "0.9rem", color: C.text, lineHeight: 1.6 }}>
                    {entry.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {phase === "idle" && (
          <div style={{ textAlign: "center", padding: "50px 20px", color: C.textMuted }}>
            <div style={{ fontSize: "4rem", marginBottom: 16 }}>🎓</div>
            <p style={{ fontSize: "1.1rem", color: C.textMid, marginBottom: 6 }}>
              Ready to practice for NAQT competition?
            </p>
            <p style={{ fontSize: "0.88rem" }}>
              Select a subject · choose voice or typing · press Generate
            </p>
          </div>
        )}

        {/* ── Score card ── */}
        {questionCount > 0 && (
          <div style={{ ...card, display: "flex", gap: 0, flexWrap: "wrap" }}>
            {[
              { label: "Total Points", val: score,          color: C.gold  },
              { label: "Correct",      val: correctCount,   color: C.green },
              { label: "⚡ Powers",    val: powerCount,     color: "#7c3aed" },
              { label: "Questions",    val: questionCount,  color: C.accent },
              { label: "Accuracy",     val: `${accuracy}%`, color: accuracy >= 70 ? C.green : accuracy >= 40 ? C.gold : C.red },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ flex: 1, minWidth: 100, textAlign: "center",
                padding: "10px 16px", borderRight: `1px solid ${C.border}` }}>
                <div style={{ fontSize: "1.8rem", fontWeight: "bold", color }}>{val}</div>
                <div style={{ fontSize: "0.65rem", color: C.textMuted, textTransform: "uppercase",
                  letterSpacing: "0.15em" }}>{label}</div>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", padding: "0 16px" }}>
              <button onClick={() => { setScore(0); setQuestionCount(0); setCorrectCount(0); setPowerCount(0); setLog([]); }}
                style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: "6px 14px", color: C.textMuted, fontSize: "0.78rem",
                  fontFamily: "inherit", cursor: "pointer" }}>
                Reset
              </button>
            </div>
          </div>
        )}

        {/* ── How to use ── */}
        <div style={{ ...card, background: C.bgAlt }}>
          <div style={{ fontSize: "0.65rem", letterSpacing: "0.2em", color: C.textMuted,
            textTransform: "uppercase", marginBottom: 12 }}>How to Use</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            {[
              ["1. Pick Subject",      "Select subject + sub-area from NAQT MS distribution"],
              ["2. Choose Input",      "Toggle between typing or voice answers"],
              ["3. ⚡ Power Buzz",     "Buzz BEFORE the ★ BUZZ HERE marker → correct = 15 pts!"],
              ["4. Normal Buzz",       "Buzz AFTER the marker or at end → correct = 10 pts"],
              ["5. Answer & Learn",    "Get scored + power clues to study for next time"],
            ].map(([title, desc]) => (
              <div key={title as string} style={{ padding: "10px 12px", background: C.bgCard,
                borderRadius: 8, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: "0.75rem", color: C.accent, fontWeight: "bold", marginBottom: 3 }}>
                  {title}
                </div>
                <div style={{ fontSize: "0.75rem", color: C.textMid, lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
