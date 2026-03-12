"use client";

// ============================================================
// NAQT Middle School Quiz Bowl — Full Featured Training App
// Power scoring · Voice answers · American TTS · Light theme
// ============================================================

// FIX 1: Added default React import — required for React.CSSProperties
//         and React.KeyboardEvent type references used throughout.
import React, { useState, useEffect, useRef, useCallback } from "react";

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
  | "idle"
  | "reading"
  | "buzzed"
  | "listening"
  | "answered"
  | "loading";

const SUBJECTS = [
  { label: "History",      sub: ["American History", "World History", "Ancient History", "Asian History", "European History"] },
  { label: "Science",      sub: ["Biology", "Chemistry", "Physics", "Earth & Space Science", "Computation"] },
  { label: "Literature",   sub: ["American Literature", "British Literature", "World Literature", "Young Adult Literature"] },
  { label: "Fine Arts",    sub: ["Classical Music", "Visual Arts", "Architecture", "Dance & Theater"] },
  { label: "Geography",    sub: ["US Geography", "World Geography", "Physical Geography"] },
  { label: "Mathematics",  sub: ["Computation", "Algebra", "Geometry", "Number Theory"] },
  { label: "Mythology",    sub: ["Greek Mythology", "Roman Mythology", "Norse Mythology", "World Mythology"] },
  { label: "Current Events", sub: ["US Current Events", "World Current Events", "Science & Tech News"] },
  { label: "Pop Culture",  sub: ["Animated Series", "Live-Action TV", "Movies", "Music"] },
  { label: "Sports",       sub: ["Olympics", "Major League Sports", "College Sports", "Sports History"] },
  { label: "Politics",     sub: ["US Government", "US Politics", "World Politics", "US Presidents"] },
];
const DIFFICULTIES = ["Middle School Standard", "MSNCT (Harder)", "Review (Easier)"];

const C = {
  bg: "#faf7f2", bgCard: "#ffffff", bgAlt: "#f5f0e8", border: "#e2d9cc",
  accent: "#1d4ed8", accentLight: "#eff6ff",
  gold: "#b45309", goldLight: "#fef3c7",
  green: "#15803d", greenLight: "#f0fdf4",
  red: "#dc2626", redLight: "#fef2f2",
  text: "#1c1917", textMid: "#57534e", textMuted: "#a8a29e",
  reading: "#0369a1", readingLight: "#f0f9ff",
  buzz: "#7c3aed", buzzLight: "#f5f3ff",
  power: "#7c3aed", powerLight: "#fdf4ff",
  shadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
  shadowMd: "0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)",
};

function getAmericanVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const preferred = ["Google US English", "Microsoft David Desktop", "Microsoft Zira Desktop", "Alex", "Samantha"];
  for (const name of preferred) {
    const v = voices.find((v) => v.name === name);
    if (v) return v;
  }
  return voices.find((v) => v.lang === "en-US") || voices.find((v) => v.lang.startsWith("en")) || null;
}

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

// FIX: Define all Web Speech API types manually.
// "SpeechRecognition" and "SpeechRecognitionEvent" are browser globals
// only available when tsconfig has lib:["dom"] — defining them here
// makes the build work regardless of tsconfig configuration.
interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
}
type SpeechRecognitionConstructor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
};

interface WindowWithSR extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

export default function NAQTQuizBowl() {
  const [subject,    setSubject]    = useState(SUBJECTS[0].label);
  const [subArea,    setSubArea]    = useState(SUBJECTS[0].sub[0]);
  const [difficulty, setDifficulty] = useState(DIFFICULTIES[0]);
  const subjectObj = SUBJECTS.find((s) => s.label === subject);

  const [phase,    setPhase]    = useState<Phase>("idle");
  const [question, setQuestion] = useState<Question | null>(null);
  const [error,    setError]    = useState("");

  const [textAnswer,  setTextAnswer]  = useState("");
  const [voiceAnswer, setVoiceAnswer] = useState("");
  const [result,      setResult]      = useState<"correct" | "wrong" | null>(null);
  const [inputMode,   setInputMode]   = useState<"text" | "voice">("text");

  // POWER scoring state
  const [isPower,    setIsPower]    = useState(false);
  const [powerCount, setPowerCount] = useState(0);
  const powerMarkPassedRef = useRef<boolean>(false);
  const powerMarkIndexRef  = useRef<number>(0);

  const answerRef      = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<InstanceType<SpeechRecognitionConstructor> | null>(null);

  const timer = useTimer();

  const [score,         setScore]         = useState(0);
  const [questionCount, setQuestionCount] = useState(0);
  const [correctCount,  setCorrectCount]  = useState(0);

  const [log, setLog] = useState<{ role: "reader" | "student" | "judge"; text: string }[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((role: "reader" | "student" | "judge", text: string) => {
    setLog((l) => [...l, { role, text }]);
    setTimeout(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }), 50);
  }, []);

  useEffect(() => {
    const obj = SUBJECTS.find((s) => s.label === subject);
    if (obj) setSubArea(obj.sub[0]);
  }, [subject]);

  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    recognitionRef.current?.abort();
  }, []);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    window.speechSynthesis.cancel();
    const doSpeak = () => {
      const utter = new SpeechSynthesisUtterance(text);
      const voice = getAmericanVoice();
      if (voice) utter.voice = voice;
      utter.lang = "en-US"; utter.rate = 0.9; utter.pitch = 1.0; utter.volume = 1.0;
      if (onEnd) utter.onend = onEnd;
      window.speechSynthesis.speak(utter);
    };
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = doSpeak;
    } else {
      doSpeak();
    }
  }, []);

  const normalize = (s: string) =>
    s.toLowerCase().replace(/^(the|a|an) /, "").replace(/[^a-z0-9 ]/g, "").trim();

  // FIX 2: submitAnswer defined FIRST so buzzIn and startVoiceAnswer can reference it
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
      const pts = isPower ? 15 : 10;
      setScore((s) => s + pts);
      setCorrectCount((c) => c + 1);
      if (isPower) setPowerCount((p) => p + 1);
      const tag = isPower ? "POWER! " : "";
      addLog("judge", `✅ ${tag}Correct! The answer is "${question.answer}". ${pts} points!`);
      speak(isPower
        ? `Power! Correct! ${question.answer}. Fifteen points.`
        : `Correct! ${question.answer}. Ten points.`);
    } else {
      addLog("judge", `❌ Incorrect. The correct answer is "${question.answer}".`);
      addLog("judge", `💡 Remember: ${question.clue}`);
      speak(`That is incorrect. The correct answer is ${question.answer}. ${question.clue}`);
    }
  }, [question, textAnswer, isPower, timer, addLog, speak]);

  // FIX 2 cont: startVoiceAnswer defined BEFORE buzzIn which calls it
  const startVoiceAnswer = useCallback(() => {
    const win = window as WindowWithSR;
    const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SR) {
      addLog("judge", "Voice recognition not supported. Please type your answer.");
      setInputMode("text");
      answerRef.current?.focus();
      return;
    }
    const recog: InstanceType<SpeechRecognitionConstructor> = new SR();
    recog.lang = "en-US";
    recog.interimResults = false;
    recog.maxAlternatives = 3;
    recognitionRef.current = recog;
    setPhase("listening");
    addLog("reader", "🎤 Listening… speak your answer now.");

    recog.onresult = (e: SpeechRecognitionEvent) => {
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
  }, [addLog, submitAnswer]);

  // FIX 3: buzzIn now after startVoiceAnswer; full deps listed
  const buzzIn = useCallback(() => {
    window.speechSynthesis?.cancel();
    const power = !powerMarkPassedRef.current;
    setIsPower(power);
    setPhase("buzzed");
    timer.start();
    if (power) {
      addLog("reader", "⚡ POWER BUZZ! Answer before the marker — 15 points if correct!");
      speak("Power buzz! Go ahead, 15 points if correct.");
    } else {
      addLog("reader", "Buzzer! Go ahead — 5 seconds.");
      speak("Buzzer! Go ahead.");
    }
    setTimeout(() => {
      if (inputMode === "voice") startVoiceAnswer();
      else answerRef.current?.focus();
    }, 600);
  }, [inputMode, speak, timer, addLog, startVoiceAnswer]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" && phase === "reading") { e.preventDefault(); buzzIn(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, buzzIn]);

  const readQuestion = useCallback((tossup: string) => {
    const powerPos = tossup.indexOf("(*)");
    powerMarkIndexRef.current  = powerPos >= 0 ? powerPos : Infinity;
    powerMarkPassedRef.current = powerPos < 0;
    const ttsText = tossup.replace(/\(\*\)/g, "... ");
    window.speechSynthesis.cancel();
    const doSpeak = () => {
      const utter = new SpeechSynthesisUtterance(ttsText);
      const voice = getAmericanVoice();
      if (voice) utter.voice = voice;
      utter.lang = "en-US"; utter.rate = 0.9; utter.pitch = 1.0; utter.volume = 1.0;
      utter.addEventListener("boundary", (e: SpeechSynthesisEvent) => {
        if (!powerMarkPassedRef.current && e.charIndex >= powerMarkIndexRef.current) {
          powerMarkPassedRef.current = true;
        }
      });
      utter.onend = () => {
        setPhase("buzzed"); timer.start();
        addLog("reader", "Time is up — please answer now.");
        setTimeout(() => answerRef.current?.focus(), 100);
      };
      window.speechSynthesis.speak(utter);
    };
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = doSpeak;
    } else { doSpeak(); }
  }, [timer, addLog]);

  const fetchQuestion = useCallback(async () => {
    setPhase("loading"); setError(""); setQuestion(null); setResult(null);
    setTextAnswer(""); setVoiceAnswer(""); setIsPower(false);
    powerMarkPassedRef.current = false; powerMarkIndexRef.current = 0;
    setLog([]); timer.reset();
    window.speechSynthesis?.cancel(); recognitionRef.current?.abort();
    try {
      const res = await fetch("/api/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, subArea, difficulty }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "API error");
      setQuestion(data); setQuestionCount((c) => c + 1); setPhase("reading");
      addLog("reader", `Next question. Category: ${subject} — ${subArea}.`);
      setTimeout(() => {
        addLog("reader", data.tossup.replace(/\(\*\)/g, "★"));
        readQuestion(data.tossup);
      }, 800);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg.includes("ANTHROPIC_API_KEY")
        ? "⚠️ Add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables."
        : "Failed to generate question. Please try again.");
      setPhase("idle");
    }
  }, [subject, subArea, difficulty, timer, addLog, readQuestion]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && textAnswer.trim()) {
      addLog("student", `"${textAnswer}"`); submitAnswer();
    }
  };

  const renderTossup = (text: string) =>
    text.split("(*)").map((part, i, arr) => (
      <span key={i}>
        {part}
        {i < arr.length - 1 && (
          <span style={{ background: C.buzzLight, color: C.buzz, padding: "2px 7px",
            borderRadius: 4, fontWeight: 700, fontSize: "0.8em",
            border: `1px solid ${C.buzz}40`, margin: "0 3px" }}>★ BUZZ HERE</span>
        )}
      </span>
    ));

  const accuracy = questionCount > 0 ? Math.round((correctCount / questionCount) * 100) : 0;

  const phaseBadge: Record<Phase, { label: string; bg: string; color: string }> = {
    idle:      { label: "Ready",    bg: C.bgAlt,       color: C.textMuted },
    loading:   { label: "Loading…", bg: C.accentLight,  color: C.accent    },
    reading:   { label: "🎙 Reading — Press SPACE to buzz!", bg: C.readingLight, color: C.reading },
    buzzed:    { label: isPower ? "⚡ POWER BUZZ — 15 pts if correct!" : "⏱ Answer Now — 10 pts",
                 bg: isPower ? C.powerLight : C.goldLight, color: isPower ? C.power : C.gold },
    listening: { label: isPower ? "🎤 Listening… ⚡ POWER active!" : "🎤 Listening…",
                 bg: C.buzzLight, color: C.buzz },
    answered:  { label: result === "correct" ? (isPower ? "⚡ POWER Correct! +15" : "✅ Correct! +10") : "❌ Incorrect",
                 bg: result === "correct" ? (isPower ? C.powerLight : C.greenLight) : C.redLight,
                 color: result === "correct" ? (isPower ? C.power : C.green) : C.red },
  };
  const badge = phaseBadge[phase];
  const card: React.CSSProperties = {
    background: C.bgCard, border: `1px solid ${C.border}`,
    borderRadius: 14, padding: "24px 28px", marginBottom: 18, boxShadow: C.shadow,
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text,
      fontFamily: "'Georgia','Times New Roman',serif",
      backgroundImage: "radial-gradient(ellipse at 80% 0%,#e0eaff44 0%,transparent 60%)" }}>

      <header style={{ background: C.bgCard, borderBottom: `1px solid ${C.border}`,
        padding: "14px 32px", display: "flex", alignItems: "center",
        justifyContent: "space-between", boxShadow: C.shadow, position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: "1.6rem" }}>🏆</span>
          <div>
            <div style={{ fontWeight: "bold", fontSize: "1.1rem" }}>
              NAQT <span style={{ color: C.accent }}>Quiz Bowl</span> Trainer
            </div>
            <div style={{ fontSize: "0.7rem", color: C.textMuted, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Middle School Series
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { val: score,          label: "Points",    color: C.gold    },
            { val: `${accuracy}%`, label: "Accuracy",  color: C.accent  },
            { val: powerCount,     label: "⚡ Powers",  color: C.power   },
            { val: questionCount,  label: "Asked",     color: C.textMid },
          ].map(({ val, label, color }) => (
            <div key={label} style={{ textAlign: "center", padding: "6px 14px",
              background: C.bgAlt, borderRadius: 10, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: "1.2rem", fontWeight: "bold", color, lineHeight: 1 }}>{val}</div>
              <div style={{ fontSize: "0.6rem", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </header>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 20px" }}>

        <div style={{ background: badge.bg, border: `1px solid ${badge.color}30`,
          borderRadius: 10, padding: "10px 18px", marginBottom: 18,
          display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: "bold", color: badge.color, fontSize: "0.95rem" }}>{badge.label}</div>
          {phase === "reading" && (
            <div style={{ fontSize: "0.8rem", color: C.textMid }}>
              Buzz <strong>before ★</strong> for ⚡ 15 pts · after for 10 pts
            </div>
          )}
        </div>

        <div style={card}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 16 }}>
            {[
              { lbl: "Subject",    val: subject,    opts: SUBJECTS.map((s) => s.label), set: setSubject    },
              { lbl: "Sub-Area",   val: subArea,    opts: subjectObj?.sub ?? [],         set: setSubArea    },
              { lbl: "Difficulty", val: difficulty, opts: DIFFICULTIES,                  set: setDifficulty },
            ].map(({ lbl, val, opts, set }) => (
              <div key={lbl}>
                <label style={{ display: "block", fontSize: "0.65rem", letterSpacing: "0.18em",
                  textTransform: "uppercase", color: C.textMuted, marginBottom: 5 }}>{lbl}</label>
                <select value={val} onChange={(e) => set(e.target.value)}
                  style={{ width: "100%", background: C.bgAlt, border: `1px solid ${C.border}`,
                    borderRadius: 8, color: C.text, padding: "9px 12px",
                    fontSize: "0.9rem", fontFamily: "inherit", cursor: "pointer", outline: "none" }}>
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: "0.72rem", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.12em" }}>
              Answer by:
            </span>
            {(["text", "voice"] as const).map((m) => (
              <button key={m} onClick={() => setInputMode(m)} style={{
                padding: "5px 14px", borderRadius: 20,
                border: `1px solid ${inputMode === m ? C.accent : C.border}`,
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
              cursor: phase === "loading" ? "not-allowed" : "pointer",
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

        {question && (
          <div style={{ ...card,
            border: `1px solid ${phase === "reading" ? C.reading : (phase === "buzzed" || phase === "listening") ? C.gold : C.border}`,
            transition: "border-color 0.3s" }}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ background: C.accentLight, color: C.accent, padding: "3px 10px",
                  borderRadius: 20, fontSize: "0.7rem", textTransform: "uppercase", fontFamily: "monospace" }}>
                  {subject}
                </span>
                <span style={{ background: C.bgAlt, color: C.textMid, padding: "3px 10px",
                  borderRadius: 20, fontSize: "0.7rem", textTransform: "uppercase", fontFamily: "monospace" }}>
                  {subArea}
                </span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {(timer.running || timer.elapsed > 0) && (
                  <div style={{ fontFamily: "monospace", fontSize: "1.5rem", fontWeight: "bold",
                    color: timer.elapsed > 5 ? C.red : C.gold, minWidth: 52, textAlign: "center" }}>
                    {timer.elapsed}s
                  </div>
                )}
                {phase === "reading" && (
                  <button onClick={buzzIn} style={{ padding: "8px 18px", borderRadius: 8,
                    border: `2px solid ${C.buzz}`, background: C.buzzLight, color: C.buzz,
                    fontSize: "0.88rem", fontFamily: "inherit", fontWeight: "bold", cursor: "pointer" }}>
                    ⚡ Stop &amp; Buzz In
                  </button>
                )}
              </div>
            </div>

            <div style={{ background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 10,
              padding: "20px 24px", marginBottom: 18, lineHeight: 1.9, fontSize: "1.05rem", color: C.text }}>
              {renderTossup(question.tossup)}
            </div>

            {phase === "buzzed" && inputMode === "text" && (
              <div>
                <label style={{ display: "block", fontSize: "0.65rem", letterSpacing: "0.18em",
                  textTransform: "uppercase", color: C.textMuted, marginBottom: 6 }}>Your Answer</label>
                <div style={{ display: "flex", gap: 10 }}>
                  <input ref={answerRef} value={textAnswer} autoFocus autoComplete="off"
                    onChange={(e) => setTextAnswer(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder="Type answer and press Enter…"
                    style={{ flex: 1, background: C.bgAlt, border: `2px solid ${C.accent}`,
                      borderRadius: 8, color: C.text, padding: "11px 14px",
                      fontSize: "1rem", fontFamily: "inherit", outline: "none" }} />
                  <button onClick={() => { addLog("student", `"${textAnswer}"`); submitAnswer(); }}
                    disabled={!textAnswer.trim()}
                    style={{ padding: "11px 22px", borderRadius: 8, border: "none",
                      background: C.accent, color: "#fff", fontFamily: "inherit", fontWeight: "bold",
                      cursor: textAnswer.trim() ? "pointer" : "not-allowed",
                      opacity: textAnswer.trim() ? 1 : 0.5 }}>Submit</button>
                </div>
                <p style={{ fontSize: "0.75rem", color: C.textMuted, marginTop: 5 }}>
                  Press Enter to submit · {timer.elapsed}s elapsed
                </p>
              </div>
            )}

            {phase === "buzzed" && inputMode === "voice" && (
              <button onClick={startVoiceAnswer} style={{ width: "100%", padding: "14px",
                borderRadius: 10, border: `2px solid ${C.buzz}`, background: C.buzzLight,
                color: C.buzz, fontSize: "1rem", fontFamily: "inherit", fontWeight: "bold", cursor: "pointer" }}>
                🎤 Tap to Speak Your Answer
              </button>
            )}

            {phase === "listening" && (
              <div style={{ textAlign: "center", padding: "20px", background: C.buzzLight,
                borderRadius: 10, border: `2px solid ${C.buzz}` }}>
                <div style={{ fontSize: "2rem", marginBottom: 8 }}>🎤</div>
                <div style={{ color: C.buzz, fontWeight: "bold" }}>Listening for your answer…</div>
                <div style={{ color: C.textMuted, fontSize: "0.85rem", marginTop: 4 }}>
                  Speak clearly into your microphone
                </div>
              </div>
            )}

            {phase === "answered" && (
              <div>
                <div style={{
                  background: result === "correct" ? (isPower ? C.powerLight : C.greenLight) : C.redLight,
                  border: `1px solid ${result === "correct" ? (isPower ? "#d8b4fe" : C.green + "40") : C.red + "40"}`,
                  borderRadius: 10, padding: "14px 20px", marginBottom: 14,
                  display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    {result === "correct" && isPower && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 5,
                        background: C.power, color: "#fff", padding: "2px 10px", borderRadius: 20,
                        fontSize: "0.7rem", fontWeight: "bold", letterSpacing: "0.12em",
                        marginBottom: 6, textTransform: "uppercase" }}>
                        ⚡ POWER — Early Buzz!
                      </div>
                    )}
                    <div style={{ fontSize: "1.1rem", fontWeight: "bold",
                      color: result === "correct" ? (isPower ? C.power : C.green) : C.red }}>
                      {result === "correct"
                        ? (isPower ? "✓ Correct! +15 points (Power)" : "✓ Correct! +10 points")
                        : "✗ Incorrect — 0 points"}
                    </div>
                    <div style={{ fontSize: "0.85rem", color: C.textMid, marginTop: 3 }}>
                      You answered: <em>&quot;{voiceAnswer || textAnswer}&quot;</em>
                      {" · "}Time: <strong style={{ color: C.gold }}>{timer.elapsed}s</strong>
                    </div>
                  </div>
                  <div style={{ fontSize: "2.2rem" }}>{result === "correct" ? (isPower ? "⚡" : "🏆") : "📖"}</div>
                </div>

                {result === "wrong" && (
                  <div style={{ background: C.goldLight, border: `1px solid ${C.gold}40`,
                    borderRadius: 10, padding: "14px 20px", marginBottom: 14 }}>
                    <div style={{ fontSize: "0.65rem", letterSpacing: "0.2em", color: C.gold,
                      textTransform: "uppercase", marginBottom: 5 }}>Correct Answer</div>
                    <div style={{ fontSize: "1.2rem", color: C.gold, fontWeight: "bold" }}>{question.answer}</div>
                    {question.alternates?.length > 0 && (
                      <div style={{ fontSize: "0.8rem", color: C.textMid, marginTop: 3 }}>
                        Also accepted: {question.alternates.join(", ")}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ background: C.accentLight, border: `1px solid ${C.accent}30`,
                  borderRadius: 10, padding: "14px 20px", marginBottom: 14 }}>
                  <div style={{ fontSize: "0.65rem", letterSpacing: "0.2em", color: C.accent,
                    textTransform: "uppercase", marginBottom: 6 }}>💡 Key Clue</div>
                  <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.7, color: C.textMid }}>{question.clue}</p>
                </div>

                {question.powerClues?.length > 0 && (
                  <div style={{ background: "#fffbeb", border: "1px solid #fde68a",
                    borderRadius: 10, padding: "14px 20px", marginBottom: 18 }}>
                    <div style={{ fontSize: "0.65rem", letterSpacing: "0.2em", color: "#92400e",
                      textTransform: "uppercase", marginBottom: 10 }}>⚡ Power Study — Know These Cold</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {question.powerClues.map((clue, i) => (
                        <li key={i} style={{ fontSize: "0.88rem", color: C.textMid, lineHeight: 1.6, marginBottom: 4 }}>
                          {clue}
                        </li>
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

            {phase === "reading" && (
              <div style={{ textAlign: "center", marginTop: 10 }}>
                <button onClick={() => {
                  window.speechSynthesis?.cancel();
                  powerMarkPassedRef.current = true;
                  setPhase("buzzed"); timer.start();
                  setTimeout(() => answerRef.current?.focus(), 100);
                }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: "6px 18px", color: C.textMuted, fontSize: "0.8rem",
                  fontFamily: "inherit", cursor: "pointer" }}>
                  Skip reading → Answer now (no power)
                </button>
              </div>
            )}
          </div>
        )}

        {log.length > 0 && (
          <div style={card}>
            <div style={{ fontSize: "0.65rem", letterSpacing: "0.2em", color: C.textMuted,
              textTransform: "uppercase", marginBottom: 12 }}>📻 Live Quiz Room</div>
            <div ref={logRef} style={{ maxHeight: 220, overflowY: "auto",
              display: "flex", flexDirection: "column", gap: 8 }}>
              {log.map((entry, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ fontSize: "0.7rem", fontWeight: "bold", minWidth: 62,
                    textTransform: "uppercase", letterSpacing: "0.08em", paddingTop: 2,
                    color: entry.role === "reader" ? C.reading : entry.role === "student" ? C.accent : C.green }}>
                    {entry.role === "reader" ? "📖 Reader" : entry.role === "student" ? "🙋 You" : "⚖️ Judge"}
                  </span>
                  <span style={{ fontSize: "0.9rem", color: C.text, lineHeight: 1.6 }}>{entry.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {phase === "idle" && (
          <div style={{ textAlign: "center", padding: "50px 20px", color: C.textMuted }}>
            <div style={{ fontSize: "4rem", marginBottom: 16 }}>🎓</div>
            <p style={{ fontSize: "1.1rem", color: C.textMid, marginBottom: 6 }}>
              Ready to practice for NAQT competition?
            </p>
            <p style={{ fontSize: "0.88rem" }}>Select a subject · choose voice or typing · press Generate</p>
          </div>
        )}

        {questionCount > 0 && (
          <div style={{ ...card, display: "flex", gap: 0, flexWrap: "wrap" }}>
            {[
              { label: "Total Points", val: score,          color: C.gold   },
              { label: "Correct",      val: correctCount,   color: C.green  },
              { label: "⚡ Powers",    val: powerCount,     color: C.power  },
              { label: "Questions",    val: questionCount,  color: C.accent },
              { label: "Accuracy",     val: `${accuracy}%`, color: accuracy >= 70 ? C.green : accuracy >= 40 ? C.gold : C.red },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ flex: 1, minWidth: 90, textAlign: "center",
                padding: "10px 14px", borderRight: `1px solid ${C.border}` }}>
                <div style={{ fontSize: "1.7rem", fontWeight: "bold", color }}>{val}</div>
                <div style={{ fontSize: "0.62rem", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.13em" }}>
                  {label}
                </div>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", padding: "0 14px" }}>
              <button onClick={() => { setScore(0); setQuestionCount(0); setCorrectCount(0); setPowerCount(0); setLog([]); }}
                style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: "6px 14px", color: C.textMuted, fontSize: "0.78rem",
                  fontFamily: "inherit", cursor: "pointer" }}>Reset</button>
            </div>
          </div>
        )}

        <div style={{ ...card, background: C.bgAlt }}>
          <div style={{ fontSize: "0.65rem", letterSpacing: "0.2em", color: C.textMuted,
            textTransform: "uppercase", marginBottom: 12 }}>How to Use</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            {[
              ["1. Pick Subject",   "Select subject + sub-area from NAQT MS distribution"],
              ["2. Choose Input",   "Toggle between typing or voice answers"],
              ["3. ⚡ Power Buzz",  "Buzz BEFORE ★ marker → correct = 15 pts!"],
              ["4. Normal Buzz",    "Buzz AFTER ★ marker or at end → correct = 10 pts"],
              ["5. Answer & Learn", "Get scored + power clues to study next time"],
            ].map(([title, desc]) => (
              <div key={title} style={{ padding: "10px 12px", background: C.bgCard,
                borderRadius: 8, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: "0.75rem", color: C.accent, fontWeight: "bold", marginBottom: 3 }}>{title}</div>
                <div style={{ fontSize: "0.75rem", color: C.textMid, lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
