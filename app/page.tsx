"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface Question {
  tossup: string; answer: string; alternates: string[];
  clue: string; powerClues: string[]; category: string;
}
type Phase = "idle"|"reading"|"buzzed"|"listening"|"answered"|"loading";

// ─────────────────────────────────────────────────────────────
// NAQT Data
// ─────────────────────────────────────────────────────────────
const SUBJECTS = [
  { label:"History",       sub:["American History","World History","Ancient History","Asian History","European History"] },
  { label:"Science",       sub:["Biology","Chemistry","Physics","Earth & Space Science","Math & Computation"] },
  { label:"Literature",    sub:["American Literature","British Literature","World Literature","Young Adult"] },
  { label:"Fine Arts",     sub:["Classical Music","Visual Arts","Architecture","Dance & Theater"] },
  { label:"Geography",     sub:["US Geography","World Geography","Physical Geography"] },
  { label:"Mathematics",   sub:["Computation","Algebra","Geometry","Number Theory"] },
  { label:"Mythology",     sub:["Greek Mythology","Roman Mythology","Norse Mythology","World Mythology"] },
  { label:"Current Events",sub:["US Current Events","World Current Events","Science & Tech News"] },
  { label:"Pop Culture",   sub:["Animated Series","Live-Action TV","Movies","Music"] },
  { label:"Sports",        sub:["Olympics","Major League Sports","College Sports","Sports History"] },
  { label:"Politics",      sub:["US Government","US Politics","World Politics","US Presidents"] },
];
const DIFFICULTIES = ["Middle School Standard","MSNCT (Harder)","Review (Easier)"];

// ─────────────────────────────────────────────────────────────
// Design tokens — bright, friendly, accessible
// ─────────────────────────────────────────────────────────────
const C = {
  // Backgrounds
  pageBg:   "linear-gradient(135deg,#667eea22 0%,#764ba222 50%,#f093fb11 100%)",
  pageBase: "#f0f2ff",
  card:     "#ffffff",
  cardAlt:  "#f8f9ff",
  // Borders
  border:   "#e0e4f5",
  // Brand
  blue:     "#4361ee",
  blueLight:"#eef1fd",
  purple:   "#7048e8",
  purpleL:  "#f3f0ff",
  // Semantic
  gold:     "#f59f00",
  goldL:    "#fff9db",
  green:    "#2f9e44",
  greenL:   "#ebfbee",
  red:      "#e03131",
  redL:     "#fff5f5",
  cyan:     "#0c8599",
  cyanL:    "#e3fafc",
  // Text
  text:     "#1a1b2e",
  textMid:  "#495057",
  textSoft: "#868e96",
  // Effects
  shadow:   "0 2px 12px rgba(67,97,238,0.10)",
  shadowLg: "0 8px 32px rgba(67,97,238,0.15)",
  radius:   "16px",
  radiusSm: "10px",
};

// ─────────────────────────────────────────────────────────────
// Speech API types (manual — no dom lib needed)
// ─────────────────────────────────────────────────────────────
interface SRAlt { readonly transcript: string; readonly confidence: number; }
interface SRResult { readonly length: number; item(i:number):SRAlt; readonly [i:number]:SRAlt; }
interface SRResultList { readonly length:number; item(i:number):SRResult; readonly [i:number]:SRResult; }
interface SREvent extends Event { readonly results: SRResultList; }
type SRCtor = new () => {
  lang:string; interimResults:boolean; maxAlternatives:number;
  start():void; abort():void;
  onresult:((e:SREvent)=>void)|null;
  onerror:((e:Event)=>void)|null;
};
interface WinSR extends Window { SpeechRecognition?:SRCtor; webkitSpeechRecognition?:SRCtor; }

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function getUSVoice(): SpeechSynthesisVoice|null {
  const vs = window.speechSynthesis.getVoices();
  const pref = ["Google US English","Microsoft David Desktop","Microsoft Zira Desktop","Alex","Samantha"];
  for (const n of pref) { const f = vs.find(v=>v.name===n); if (f) return f; }
  return vs.find(v=>v.lang==="en-US") || vs.find(v=>v.lang.startsWith("en")) || null;
}

function useTimer() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const iref = useRef<ReturnType<typeof setInterval>|null>(null);
  const start = useCallback(()=>{ setElapsed(0); setRunning(true); },[]);
  const stop  = useCallback(()=>setRunning(false),[]);
  const reset = useCallback(()=>{ setRunning(false); setElapsed(0); },[]);
  useEffect(()=>{
    if (running) iref.current = setInterval(()=>setElapsed(e=>e+1),1000);
    else if (iref.current) clearInterval(iref.current);
    return ()=>{ if(iref.current) clearInterval(iref.current); };
  },[running]);
  return { elapsed, running, start, stop, reset };
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
export default function NAQTQuizBowl() {
  const [subject,    setSubject]    = useState(SUBJECTS[0].label);
  const [subArea,    setSubArea]    = useState(SUBJECTS[0].sub[0]);
  const [difficulty, setDifficulty] = useState(DIFFICULTIES[0]);
  const subObj = SUBJECTS.find(s=>s.label===subject);

  const [phase,    setPhase]    = useState<Phase>("idle");
  const [question, setQuestion] = useState<Question|null>(null);
  const [error,    setError]    = useState("");

  const [textAns,  setTextAns]  = useState("");
  const [voiceAns, setVoiceAns] = useState("");
  const [result,   setResult]   = useState<"correct"|"wrong"|null>(null);
  const [mode,     setMode]     = useState<"text"|"voice">("text");

  const [isPower,     setIsPower]     = useState(false);
  const [powerCount,  setPowerCount]  = useState(0);
  const pPassedRef = useRef<boolean>(false);
  const pIdxRef    = useRef<number>(0);

  const inputRef  = useRef<HTMLInputElement>(null);
  const recognRef = useRef<InstanceType<SRCtor>|null>(null);
  const logRef    = useRef<HTMLDivElement>(null);
  const timer = useTimer();

  const [score,   setScore]   = useState(0);
  const [qCount,  setQCount]  = useState(0);
  const [correct, setCorrect] = useState(0);
  const [log,     setLog]     = useState<{role:"reader"|"student"|"judge";text:string}[]>([]);

  const addLog = useCallback((role:"reader"|"student"|"judge", text:string)=>{
    setLog(l=>[...l,{role,text}]);
    setTimeout(()=>logRef.current?.scrollTo({top:logRef.current.scrollHeight,behavior:"smooth"}),50);
  },[]);

  useEffect(()=>{
    const o = SUBJECTS.find(s=>s.label===subject); if (o) setSubArea(o.sub[0]);
  },[subject]);

  useEffect(()=>()=>{ window.speechSynthesis?.cancel(); recognRef.current?.abort(); },[]);

  const speak = useCallback((txt:string, onEnd?:()=>void)=>{
    window.speechSynthesis.cancel();
    const go=()=>{
      const u = new SpeechSynthesisUtterance(txt);
      const v = getUSVoice(); if(v) u.voice=v;
      u.lang="en-US"; u.rate=0.9; u.pitch=1; u.volume=1;
      if(onEnd) u.onend=onEnd;
      window.speechSynthesis.speak(u);
    };
    window.speechSynthesis.getVoices().length===0
      ? (window.speechSynthesis.onvoiceschanged=go) : go();
  },[]);

  const norm = (s:string) =>
    s.toLowerCase().replace(/^(the|a|an) /,"").replace(/[^a-z0-9 ]/g,"").trim();

  // --- submitAnswer (defined first) ---
  const submitAnswer = useCallback((ans?:string)=>{
    if(!question) return;
    timer.stop();
    const ua = norm(ans??textAns); if(!ua) return;
    const ok =
      norm(question.answer)===ua ||
      (question.alternates||[]).some(a=>norm(a)===ua) ||
      norm(question.answer).includes(ua) ||
      ua.includes(norm(question.answer).split(" ").slice(-1)[0]);
    setResult(ok?"correct":"wrong");
    setPhase("answered");
    if(ok){
      const pts = isPower?15:10;
      setScore(s=>s+pts); setCorrect(c=>c+1);
      if(isPower) setPowerCount(p=>p+1);
      addLog("judge",`✅ ${isPower?"⚡ POWER! ":""}Correct! "${question.answer}" — ${pts} pts!`);
      speak(isPower?`Power! Correct! ${question.answer}. Fifteen points.`:`Correct! ${question.answer}. Ten points.`);
    } else {
      addLog("judge",`❌ Incorrect. Answer: "${question.answer}".`);
      speak(`Incorrect. The answer is ${question.answer}.`);
    }
  },[question,textAns,isPower,timer,addLog,speak]);

  // --- startVoiceAnswer (before buzzIn) ---
  const startVoiceAnswer = useCallback(()=>{
    const SR=(window as WinSR).SpeechRecognition||(window as WinSR).webkitSpeechRecognition;
    if(!SR){
      addLog("judge","Voice not supported in this browser. Please type.");
      setMode("text"); inputRef.current?.focus(); return;
    }
    const r:InstanceType<SRCtor>=new SR();
    r.lang="en-US"; r.interimResults=false; r.maxAlternatives=3;
    recognRef.current=r; setPhase("listening");
    addLog("reader","🎤 Listening… speak now.");
    r.onresult=(e:SREvent)=>{
      const heard=e.results[0][0].transcript;
      setVoiceAns(heard); addLog("student",`"${heard}"`);
      setPhase("buzzed"); submitAnswer(heard);
    };
    r.onerror=()=>{
      addLog("judge","Couldn't hear that — please type."); setPhase("buzzed");
      setMode("text"); inputRef.current?.focus();
    };
    r.start();
  },[addLog,submitAnswer]);

  // --- buzzIn ---
  const buzzIn = useCallback(()=>{
    window.speechSynthesis?.cancel();
    const power=!pPassedRef.current; setIsPower(power);
    setPhase("buzzed"); timer.start();
    if(power){ addLog("reader","⚡ POWER BUZZ! 15 pts if correct!"); speak("Power buzz! 15 points if correct."); }
    else      { addLog("reader","Buzzer! Go ahead.");               speak("Buzzer! Go ahead."); }
    setTimeout(()=>{ if(mode==="voice") startVoiceAnswer(); else inputRef.current?.focus(); },600);
  },[mode,speak,timer,addLog,startVoiceAnswer]);

  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{ if(e.code==="Space"&&phase==="reading"){e.preventDefault();buzzIn();} };
    window.addEventListener("keydown",h); return()=>window.removeEventListener("keydown",h);
  },[phase,buzzIn]);

  const readQuestion = useCallback((tossup:string)=>{
    const pos=tossup.indexOf("(*)");
    pIdxRef.current  = pos>=0?pos:Infinity;
    pPassedRef.current = pos<0;
    const tts=tossup.replace(/\(\*\)/g,"... ");
    window.speechSynthesis.cancel();
    const go=()=>{
      const u=new SpeechSynthesisUtterance(tts);
      const v=getUSVoice(); if(v) u.voice=v;
      u.lang="en-US"; u.rate=0.9; u.pitch=1; u.volume=1;
      u.addEventListener("boundary",(e:SpeechSynthesisEvent)=>{
        if(!pPassedRef.current&&e.charIndex>=pIdxRef.current) pPassedRef.current=true;
      });
      u.onend=()=>{ setPhase("buzzed"); timer.start(); addLog("reader","Time — answer now."); setTimeout(()=>inputRef.current?.focus(),100); };
      window.speechSynthesis.speak(u);
    };
    window.speechSynthesis.getVoices().length===0
      ? (window.speechSynthesis.onvoiceschanged=go) : go();
  },[timer,addLog]);

  const fetchQuestion = useCallback(async()=>{
    setPhase("loading"); setError(""); setQuestion(null); setResult(null);
    setTextAns(""); setVoiceAns(""); setIsPower(false);
    pPassedRef.current=false; pIdxRef.current=0;
    setLog([]); timer.reset();
    window.speechSynthesis?.cancel(); recognRef.current?.abort();
    try{
      const res=await fetch("/api/question",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({subject,subArea,difficulty}),
      });

      // Check content-type BEFORE calling .json()
      // If the route file is missing/misplaced, Next.js returns an HTML 404 page.
      const contentType = res.headers.get("content-type")||"";
      if (!contentType.includes("application/json")) {
        throw new Error(
          res.status===404
            ? "⚠️ API route not found (404). Make sure app/api/question/route.ts exists in your GitHub repo and Vercel has redeployed."
            : `⚠️ Server returned ${res.status} (non-JSON). Check Vercel function logs for details.`
        );
      }

      const data=await res.json();
      if(!res.ok||data.error) throw new Error(data.error||"API error");
      setQuestion(data); setQCount(c=>c+1); setPhase("reading");
      addLog("reader",`Category: ${subject} — ${subArea}.`);
      setTimeout(()=>{ addLog("reader",data.tossup.replace(/\(\*\)/g,"★")); readQuestion(data.tossup); },600);
    }catch(e:unknown){
      setError(e instanceof Error ? e.message : "Failed to generate question. Please try again.");
      setPhase("idle");
    }
  },[subject,subArea,difficulty,timer,addLog,readQuestion]);

  const handleKey=(e:React.KeyboardEvent)=>{
    if(e.key==="Enter"&&textAns.trim()){ addLog("student",`"${textAns}"`); submitAnswer(); }
  };

  const renderTossup=(text:string)=>
    text.split("(*)").map((part,i,a)=>(
      <span key={i}>{part}
        {i<a.length-1&&<span style={{background:C.purpleL,color:C.purple,padding:"2px 8px",
          borderRadius:6,fontWeight:700,fontSize:"0.8em",border:`1.5px solid ${C.purple}50`,margin:"0 4px"}}>
          ⚡ BUZZ
        </span>}
      </span>
    ));

  const acc = qCount>0 ? Math.round((correct/qCount)*100) : 0;

  // ── Shared styles ──
  const cardStyle:React.CSSProperties = {
    background:C.card, border:`1.5px solid ${C.border}`,
    borderRadius:C.radius, padding:"20px", marginBottom:16, boxShadow:C.shadow,
  };
  const labelStyle:React.CSSProperties = {
    display:"block", fontSize:"0.62rem", letterSpacing:"0.16em",
    textTransform:"uppercase", color:C.textSoft, marginBottom:5, fontFamily:"system-ui,sans-serif",
  };
  const pill=(active:boolean):React.CSSProperties=>({
    padding:"8px 20px", borderRadius:24,
    border:`2px solid ${active?C.blue:C.border}`,
    background:active?C.blue:"#fff",
    color:active?"#fff":C.textMid,
    fontFamily:"system-ui,sans-serif", fontWeight:active?700:400,
    cursor:"pointer", fontSize:"0.92rem", transition:"all 0.15s",
  });

  // Phase banner
  const phases:Record<Phase,{emoji:string;text:string;bg:string;color:string}> = {
    idle:     {emoji:"🎓",text:"Pick a subject and tap Generate!",       bg:C.cardAlt,   color:C.textSoft},
    loading:  {emoji:"⏳",text:"Generating your question…",             bg:C.blueLight, color:C.blue    },
    reading:  {emoji:"🎙",text:"Listening… Buzz before ★ for 15 pts!", bg:C.cyanL,     color:C.cyan    },
    buzzed:   isPower
              ? {emoji:"⚡",text:"POWER BUZZ — Answer for 15 pts!",     bg:"#f3f0ff",   color:C.purple  }
              : {emoji:"⏱",text:"You buzzed — answer for 10 pts!",     bg:C.goldL,     color:C.gold    },
    listening:{emoji:"🎤",text:isPower?"Listening… ⚡ POWER active!":"Listening for your answer…",
                                                                         bg:C.purpleL,   color:C.purple  },
    answered: result==="correct"
              ? isPower
                ? {emoji:"⚡",text:"POWER CORRECT! +15 points",         bg:C.purpleL,   color:C.purple  }
                : {emoji:"🏆",text:"Correct! +10 points",              bg:C.greenL,    color:C.green   }
              : {emoji:"📖",text:"Incorrect — 0 points",               bg:C.redL,      color:C.red     },
  };
  const ph = phases[phase];

  const howTo = [
    {icon:"📚",step:"1",title:"Pick Subject",   desc:"Choose topic & sub-area"},
    {icon:"🎙",step:"2",title:"Voice or Type",  desc:"Select answer method"},
    {icon:"⚡",step:"3",title:"Power Buzz",     desc:"Before ★ = 15 pts"},
    {icon:"🔔",step:"4",title:"Normal Buzz",    desc:"After ★ = 10 pts"},
    {icon:"💡",step:"5",title:"Learn & Review", desc:"Study clues after each Q"},
  ];

  return (
    <>
      <style>{`
        *{box-sizing:border-box;}
        body{margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
        select,input,button{font-family:inherit;-webkit-appearance:none;appearance:none;}
        /* Prevent iOS zoom on input focus — font-size must be ≥16px */
        select,input,button{font-size:16px;}
        .quiz-select{width:100%;padding:11px 12px;border-radius:10px;outline:none;cursor:pointer;}
        .quiz-input{width:100%;padding:13px 14px;border-radius:12px;outline:none;font-size:1rem;}
        /* Responsive grid */
        .cfg-grid{display:grid;gap:12px;grid-template-columns:1fr 1fr 1fr;}
        .howto-row{display:grid;gap:10px;grid-template-columns:repeat(5,1fr);}
        /* Tablet */
        @media(max-width:768px){
          .cfg-grid{grid-template-columns:1fr 1fr;}
          .howto-row{grid-template-columns:repeat(5,1fr);gap:6px;}
          .header-scores{gap:6px!important;}
          .score-pill{padding:4px 8px!important;min-width:54px!important;}
          .score-val{font-size:1rem!important;}
          .score-lbl{font-size:0.54rem!important;}
        }
        /* Phone */
        @media(max-width:480px){
          .cfg-grid{grid-template-columns:1fr;}
          .howto-row{grid-template-columns:repeat(3,1fr);gap:6px;}
          .main-pad{padding:14px 12px 40px!important;}
          .card-pad{padding:16px!important;}
          .header-inner{flex-direction:column;align-items:flex-start!important;gap:8px!important;}
          .header-scores{flex-wrap:wrap!important;}
        }
        /* Hover states for non-touch */
        @media(hover:hover){
          .gen-btn:hover{opacity:0.9;transform:translateY(-1px);}
          .buzz-btn:hover{background:#ede9fe!important;}
        }
        /* Touch feedback */
        .gen-btn:active,.buzz-btn:active{opacity:0.85;}
      `}</style>

      <div style={{minHeight:"100vh",background:C.pageBase,
        backgroundImage:C.pageBg,color:C.text,fontFamily:"Georgia,'Times New Roman',serif"}}>

        {/* ══ HEADER ══ */}
        <header style={{background:"#fff",borderBottom:`1.5px solid ${C.border}`,
          boxShadow:C.shadow,position:"sticky",top:0,zIndex:50}}>
          <div className="header-inner" style={{maxWidth:880,margin:"0 auto",padding:"12px 16px",
            display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
            {/* Logo */}
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:"1.9rem"}}>🏆</span>
              <div>
                <div style={{fontWeight:"bold",fontSize:"1.05rem",lineHeight:1.2,color:C.text}}>
                  NAQT <span style={{color:C.blue}}>Quiz Bowl</span>
                </div>
                <div style={{fontSize:"0.58rem",color:C.textSoft,letterSpacing:"0.16em",
                  textTransform:"uppercase",fontFamily:"system-ui,sans-serif"}}>Middle School Trainer</div>
              </div>
            </div>
            {/* Score pills */}
            <div className="header-scores" style={{display:"flex",gap:8}}>
              {([
                {v:score,        l:"Points",  c:C.gold  },
                {v:`${acc}%`,    l:"Accuracy",c:C.blue  },
                {v:powerCount,   l:"⚡ Powers",c:C.purple},
                {v:qCount,       l:"Asked",   c:C.textMid},
              ] as {v:string|number,l:string,c:string}[]).map(({v,l,c})=>(
                <div key={l} className="score-pill" style={{textAlign:"center",padding:"5px 11px",
                  background:C.cardAlt,borderRadius:10,border:`1.5px solid ${C.border}`,minWidth:62}}>
                  <div className="score-val" style={{fontSize:"1.15rem",fontWeight:"bold",color:c,lineHeight:1}}>{v}</div>
                  <div className="score-lbl" style={{fontSize:"0.56rem",color:C.textSoft,
                    textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"system-ui,sans-serif"}}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </header>

        <div className="main-pad" style={{maxWidth:880,margin:"0 auto",padding:"20px 16px 40px"}}>

          {/* ══ PHASE BANNER ══ */}
          <div style={{background:ph.bg,border:`1.5px solid ${ph.color}30`,
            borderRadius:14,padding:"12px 18px",marginBottom:16,
            display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <span style={{fontSize:"1.4rem"}}>{ph.emoji}</span>
            <span style={{fontWeight:"bold",color:ph.color,fontSize:"0.98rem",
              fontFamily:"system-ui,sans-serif"}}>{ph.text}</span>
            {phase==="reading"&&(
              <span style={{marginLeft:"auto",fontSize:"0.72rem",color:C.textMid,
                fontFamily:"system-ui,sans-serif",background:"#fff",
                padding:"3px 10px",borderRadius:20,border:`1px solid ${C.border}`}}>
                SPACE = Buzz In
              </span>
            )}
          </div>

          {/* ══ CONFIG CARD ══ */}
          <div className="card-pad" style={cardStyle}>
            {/* Subject / Sub-Area / Difficulty */}
            <div className="cfg-grid" style={{marginBottom:14}}>
              {[
                {lbl:"Subject",    val:subject,    opts:SUBJECTS.map(s=>s.label), set:setSubject   },
                {lbl:"Sub-Area",   val:subArea,    opts:subObj?.sub??[],           set:setSubArea   },
                {lbl:"Difficulty", val:difficulty, opts:DIFFICULTIES,              set:setDifficulty},
              ].map(({lbl,val,opts,set})=>(
                <div key={lbl}>
                  <label style={labelStyle}>{lbl}</label>
                  <select className="quiz-select" value={val} onChange={e=>set(e.target.value)}
                    style={{background:C.cardAlt,border:`1.5px solid ${C.border}`,color:C.text}}>
                    {opts.map(o=><option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Answer mode toggle */}
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
              <span style={{...labelStyle,marginBottom:0}}>Answer by:</span>
              {(["text","voice"] as const).map(m=>(
                <button key={m} onClick={()=>setMode(m)} style={pill(mode===m)}>
                  {m==="text"?"⌨️ Typing":"🎤 Voice"}
                </button>
              ))}
            </div>

            {/* Generate button */}
            <button className="gen-btn" onClick={fetchQuestion} disabled={phase==="loading"}
              style={{width:"100%",padding:"16px",borderRadius:14,border:"none",
                background:phase==="loading"
                  ?"#e9ecef"
                  :"linear-gradient(135deg,#4361ee,#7048e8)",
                color:phase==="loading"?C.textSoft:"#fff",
                fontSize:"1.08rem",fontFamily:"system-ui,sans-serif",fontWeight:"bold",
                letterSpacing:"0.03em",cursor:phase==="loading"?"not-allowed":"pointer",
                boxShadow:phase==="loading"?"none":C.shadowLg,
                transition:"all 0.2s",WebkitAppearance:"none"}}>
              {phase==="loading"?"⏳  Generating Question…":"⚡  Generate New Question"}
            </button>

            {/* Error */}
            {error&&(
              <div style={{marginTop:12,padding:"14px 16px",background:C.redL,
                border:`1.5px solid ${C.red}40`,borderRadius:12,color:C.red,
                fontSize:"0.88rem",lineHeight:1.6,fontFamily:"system-ui,sans-serif"}}>
                {error}
                {error.includes("ANTHROPIC_API_KEY")&&(
                  <div style={{marginTop:8,padding:"10px",background:"#fff",borderRadius:8,
                    fontSize:"0.82rem",color:C.textMid}}>
                    <strong>Fix:</strong> Go to <strong>Vercel → your project → Settings → Environment Variables</strong>,
                    add <code style={{background:"#f1f3f5",padding:"1px 5px",borderRadius:4}}>ANTHROPIC_API_KEY</code>,
                    then <strong>Redeploy</strong>.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ══ QUESTION CARD ══ */}
          {question&&(
            <div className="card-pad" style={{...cardStyle,
              border:`2px solid ${phase==="reading"?C.cyan:(phase==="buzzed"||phase==="listening")?C.gold:C.border}`,
              transition:"border-color 0.3s"}}>

              {/* Tags + timer + buzz button */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                marginBottom:14,flexWrap:"wrap",gap:8}}>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <span style={{background:C.blueLight,color:C.blue,padding:"4px 12px",
                    borderRadius:20,fontSize:"0.7rem",textTransform:"uppercase",
                    fontFamily:"system-ui,sans-serif",fontWeight:600}}>{subject}</span>
                  <span style={{background:C.cardAlt,color:C.textMid,padding:"4px 12px",
                    borderRadius:20,fontSize:"0.7rem",textTransform:"uppercase",
                    fontFamily:"system-ui,sans-serif"}}>{subArea}</span>
                </div>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  {(timer.running||timer.elapsed>0)&&(
                    <div style={{fontFamily:"'Courier New',monospace",fontSize:"1.6rem",fontWeight:"bold",
                      color:timer.elapsed>5?C.red:C.gold,minWidth:50,textAlign:"center"}}>
                      {timer.elapsed}s
                    </div>
                  )}
                  {phase==="reading"&&(
                    <button className="buzz-btn" onClick={buzzIn}
                      style={{padding:"11px 22px",borderRadius:12,
                        border:`2px solid ${C.purple}`,background:C.purpleL,color:C.purple,
                        fontSize:"1rem",fontFamily:"system-ui,sans-serif",fontWeight:"bold",
                        cursor:"pointer",boxShadow:C.shadow,WebkitAppearance:"none"}}>
                      ⚡ Buzz In!
                    </button>
                  )}
                </div>
              </div>

              {/* Tossup text */}
              <div style={{background:C.cardAlt,border:`1.5px solid ${C.border}`,borderRadius:14,
                padding:"18px 20px",marginBottom:16,
                lineHeight:1.95,fontSize:"clamp(0.95rem,2.5vw,1.08rem)",color:C.text}}>
                {renderTossup(question.tossup)}
              </div>

              {/* Text input */}
              {phase==="buzzed"&&mode==="text"&&(
                <div>
                  <label style={labelStyle}>Your Answer</label>
                  <div style={{display:"flex",gap:8}}>
                    <input ref={inputRef} value={textAns} autoFocus autoComplete="off"
                      onChange={e=>setTextAns(e.target.value)} onKeyDown={handleKey}
                      placeholder="Type your answer…"
                      className="quiz-input"
                      style={{flex:1,background:"#fff",border:`2px solid ${C.blue}`,color:C.text}}/>
                    <button onClick={()=>{addLog("student",`"${textAns}"`);submitAnswer();}}
                      disabled={!textAns.trim()}
                      style={{padding:"13px 20px",borderRadius:12,border:"none",
                        background:C.blue,color:"#fff",fontFamily:"system-ui,sans-serif",
                        fontWeight:"bold",cursor:textAns.trim()?"pointer":"not-allowed",
                        opacity:textAns.trim()?1:0.5,fontSize:"1rem",whiteSpace:"nowrap",
                        WebkitAppearance:"none"}}>
                      Submit ↵
                    </button>
                  </div>
                  <p style={{fontSize:"0.72rem",color:C.textSoft,marginTop:5,
                    fontFamily:"system-ui,sans-serif"}}>
                    Press Enter or tap Submit · {timer.elapsed}s elapsed
                  </p>
                </div>
              )}

              {/* Voice button */}
              {phase==="buzzed"&&mode==="voice"&&(
                <button onClick={startVoiceAnswer}
                  style={{width:"100%",padding:"18px",borderRadius:14,
                    border:`2px solid ${C.purple}`,background:C.purpleL,
                    color:C.purple,fontSize:"1.1rem",fontFamily:"system-ui,sans-serif",
                    fontWeight:"bold",cursor:"pointer",WebkitAppearance:"none"}}>
                  🎤 Tap to Speak Your Answer
                </button>
              )}

              {/* Listening */}
              {phase==="listening"&&(
                <div style={{textAlign:"center",padding:"28px 20px",background:C.purpleL,
                  borderRadius:14,border:`2px solid ${C.purple}`}}>
                  <div style={{fontSize:"3rem",marginBottom:8}}>🎤</div>
                  <div style={{color:C.purple,fontWeight:"bold",fontSize:"1.1rem",
                    fontFamily:"system-ui,sans-serif"}}>Listening…</div>
                  <div style={{color:C.textSoft,fontSize:"0.85rem",marginTop:4,
                    fontFamily:"system-ui,sans-serif"}}>Speak clearly into your mic</div>
                </div>
              )}

              {/* Result */}
              {phase==="answered"&&(
                <div>
                  {/* Score banner */}
                  <div style={{
                    background:result==="correct"?(isPower?C.purpleL:C.greenL):C.redL,
                    border:`2px solid ${result==="correct"?(isPower?C.purple+"60":C.green+"60"):C.red+"60"}`,
                    borderRadius:14,padding:"16px 18px",marginBottom:14,
                    display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                    <div>
                      {result==="correct"&&isPower&&(
                        <div style={{display:"inline-flex",alignItems:"center",gap:5,
                          background:C.purple,color:"#fff",padding:"3px 12px",borderRadius:20,
                          fontSize:"0.7rem",fontWeight:"bold",marginBottom:8,
                          textTransform:"uppercase",letterSpacing:"0.1em",
                          fontFamily:"system-ui,sans-serif"}}>
                          ⚡ POWER — Early Buzz!
                        </div>
                      )}
                      <div style={{fontSize:"1.1rem",fontWeight:"bold",
                        color:result==="correct"?(isPower?C.purple:C.green):C.red,
                        fontFamily:"system-ui,sans-serif"}}>
                        {result==="correct"
                          ?(isPower?"✓ Correct! +15 points (Power)":"✓ Correct! +10 points")
                          :"✗ Incorrect — 0 points"}
                      </div>
                      <div style={{fontSize:"0.82rem",color:C.textMid,marginTop:4,
                        fontFamily:"system-ui,sans-serif"}}>
                        You said: <em>&quot;{voiceAns||textAns}&quot;</em>
                        {" · "}Time: <strong style={{color:C.gold}}>{timer.elapsed}s</strong>
                      </div>
                    </div>
                    <div style={{fontSize:"2.2rem"}}>{result==="correct"?(isPower?"⚡":"🏆"):"📖"}</div>
                  </div>

                  {/* Correct answer (wrong only) */}
                  {result==="wrong"&&(
                    <div style={{background:C.goldL,border:`1.5px solid ${C.gold}50`,
                      borderRadius:14,padding:"14px 18px",marginBottom:14}}>
                      <div style={{...labelStyle,marginBottom:6}}>Correct Answer</div>
                      <div style={{fontSize:"1.25rem",color:C.gold,fontWeight:"bold"}}>{question.answer}</div>
                      {question.alternates?.length>0&&(
                        <div style={{fontSize:"0.78rem",color:C.textMid,marginTop:4,
                          fontFamily:"system-ui,sans-serif"}}>
                          Also accepted: {question.alternates.join(", ")}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Key clue */}
                  <div style={{background:C.blueLight,border:`1.5px solid ${C.blue}30`,
                    borderRadius:14,padding:"14px 18px",marginBottom:14}}>
                    <div style={labelStyle}>💡 Key Clue</div>
                    <p style={{margin:0,fontSize:"0.95rem",lineHeight:1.75,color:C.textMid}}>
                      {question.clue}
                    </p>
                  </div>

                  {/* Power study */}
                  {question.powerClues?.length>0&&(
                    <div style={{background:"#fffbe6",border:"1.5px solid #ffe066",
                      borderRadius:14,padding:"14px 18px",marginBottom:18}}>
                      <div style={labelStyle}>⚡ Power Study — Memorize These!</div>
                      <ul style={{margin:0,paddingLeft:18}}>
                        {question.powerClues.map((c,i)=>(
                          <li key={i} style={{fontSize:"0.9rem",color:C.textMid,lineHeight:1.7,marginBottom:4}}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <button className="gen-btn" onClick={fetchQuestion}
                    style={{width:"100%",padding:"15px",borderRadius:14,border:"none",
                      background:"linear-gradient(135deg,#4361ee,#7048e8)",
                      color:"#fff",fontSize:"1.05rem",fontFamily:"system-ui,sans-serif",
                      fontWeight:"bold",cursor:"pointer",boxShadow:C.shadowLg,WebkitAppearance:"none"}}>
                    ⚡ Next Question
                  </button>
                </div>
              )}

              {/* Skip reading */}
              {phase==="reading"&&(
                <div style={{textAlign:"center",marginTop:12}}>
                  <button onClick={()=>{
                    window.speechSynthesis?.cancel();
                    pPassedRef.current=true; setPhase("buzzed"); timer.start();
                    setTimeout(()=>inputRef.current?.focus(),100);
                  }} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,
                    padding:"7px 16px",color:C.textSoft,fontSize:"0.8rem",
                    fontFamily:"system-ui,sans-serif",cursor:"pointer"}}>
                    Skip reading → Answer now (no power)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ══ QUIZ LOG ══ */}
          {log.length>0&&(
            <div className="card-pad" style={cardStyle}>
              <div style={labelStyle}>📻 Live Quiz Room</div>
              <div ref={logRef} style={{maxHeight:190,overflowY:"auto",
                display:"flex",flexDirection:"column",gap:8}}>
                {log.map((e,i)=>(
                  <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                    <span style={{fontSize:"0.66rem",fontWeight:"bold",minWidth:60,paddingTop:3,
                      textTransform:"uppercase",fontFamily:"system-ui,sans-serif",
                      color:e.role==="reader"?C.cyan:e.role==="student"?C.blue:C.green}}>
                      {e.role==="reader"?"📖 Reader":e.role==="student"?"🙋 You":"⚖️ Judge"}
                    </span>
                    <span style={{fontSize:"0.9rem",color:C.text,lineHeight:1.6}}>{e.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ IDLE EMPTY STATE ══ */}
          {phase==="idle"&&(
            <div style={{textAlign:"center",padding:"40px 20px"}}>
              <div style={{fontSize:"4.5rem",marginBottom:14}}>🎓</div>
              <div style={{fontSize:"1.2rem",fontWeight:"bold",color:C.textMid,marginBottom:6,
                fontFamily:"system-ui,sans-serif"}}>Ready for NAQT practice?</div>
              <div style={{fontSize:"0.9rem",color:C.textSoft,fontFamily:"system-ui,sans-serif"}}>
                Pick a subject · choose voice or typing · tap Generate
              </div>
            </div>
          )}

          {/* ══ SCORE SUMMARY ══ */}
          {qCount>0&&(
            <div className="card-pad" style={{...cardStyle,padding:"16px"}}>
              <div style={{display:"flex",flexWrap:"wrap"}}>
                {[
                  {label:"Points",    val:score,       color:C.gold  },
                  {label:"Correct",   val:correct,     color:C.green },
                  {label:"⚡ Powers", val:powerCount,  color:C.purple},
                  {label:"Questions", val:qCount,      color:C.blue  },
                  {label:"Accuracy",  val:`${acc}%`,   color:acc>=70?C.green:acc>=40?C.gold:C.red},
                ].map(({label,val,color})=>(
                  <div key={label} style={{flex:"1 1 72px",textAlign:"center",
                    padding:"10px 8px",borderRight:`1px solid ${C.border}`}}>
                    <div style={{fontSize:"1.7rem",fontWeight:"bold",color}}>{val}</div>
                    <div style={{fontSize:"0.6rem",color:C.textSoft,textTransform:"uppercase",
                      letterSpacing:"0.1em",fontFamily:"system-ui,sans-serif"}}>{label}</div>
                  </div>
                ))}
                <div style={{display:"flex",alignItems:"center",padding:"0 12px"}}>
                  <button onClick={()=>{setScore(0);setQCount(0);setCorrect(0);setPowerCount(0);setLog([]);}}
                    style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,
                      padding:"6px 12px",color:C.textSoft,fontSize:"0.78rem",
                      fontFamily:"system-ui,sans-serif",cursor:"pointer",WebkitAppearance:"none"}}>
                    Reset
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ══ HOW TO USE — single row of 5 ══ */}
          <div className="card-pad" style={{...cardStyle,background:C.cardAlt}}>
            <div style={labelStyle}>How to Use</div>
            <div className="howto-row">
              {howTo.map(({icon,step,title,desc})=>(
                <div key={step} style={{textAlign:"center",padding:"12px 6px",
                  background:"#fff",borderRadius:12,border:`1.5px solid ${C.border}`}}>
                  <div style={{fontSize:"1.6rem",marginBottom:4}}>{icon}</div>
                  <div style={{fontSize:"0.62rem",color:C.blue,fontWeight:"bold",
                    fontFamily:"system-ui,sans-serif",marginBottom:1}}>Step {step}</div>
                  <div style={{fontSize:"0.76rem",color:C.text,fontWeight:"bold",
                    fontFamily:"system-ui,sans-serif",marginBottom:3}}>{title}</div>
                  <div style={{fontSize:"0.68rem",color:C.textMid,lineHeight:1.4,
                    fontFamily:"system-ui,sans-serif"}}>{desc}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
