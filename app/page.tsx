"use client";
// ═══════════════════════════════════════════════════════
// NAQT Quiz Bowl Trainer — QB Reader edition
// Real questions · Word-by-word TTS · 15s/10s timers · AI judging
// ═══════════════════════════════════════════════════════
import React, { useState, useEffect, useRef, useCallback } from "react";

// ── Types ──────────────────────────────────────────────
interface QBQuestion {
  question: string;   // sanitized, contains (*) marker
  answer: string;
  category: string;
  subcategory: string;
  setName: string;
  difficulty: number;
}
interface JudgeResult { correct: boolean; points: number; reason: string; }
type Phase = "idle"|"loading"|"reading"|"buzzed"|"listening"|"judging"|"answered";

// ── Web Speech API types (self-contained) ──────────────
interface SRAlt { readonly transcript: string; readonly confidence: number; }
interface SRRes  { readonly length: number; item(i:number):SRAlt; readonly [i:number]:SRAlt; }
interface SRList { readonly length: number; item(i:number):SRRes;  readonly [i:number]:SRRes;  }
interface SREv extends Event { readonly results: SRList; }
type SRCtor = new ()=>{ lang:string; interimResults:boolean; maxAlternatives:number;
  start():void; abort():void; onresult:((e:SREv)=>void)|null; onerror:((e:Event)=>void)|null; };
interface WinSR extends Window { SpeechRecognition?:SRCtor; webkitSpeechRecognition?:SRCtor; }

// ── Categories & difficulties ──────────────────────────
const CATEGORIES = ["History","Science","Literature","Fine Arts",
  "Mythology","Geography","Philosophy","Social Science","Current Events","Pop Culture"];

const DIFFS = [
  {label:"Middle School",   val:"1"},
  {label:"Easy High School",val:"2"},
  {label:"Regular HS",      val:"3"},
];

// ── Design tokens ──────────────────────────────────────
const C = {
  bg:"#eef0fb", card:"#ffffff", cardAlt:"#f6f7fd",
  border:"#dde1f5", blue:"#3b5bdb", blueL:"#edf2ff",
  purple:"#6741d9", purpleL:"#f3f0ff",
  gold:"#e67700", goldL:"#fff3bf",
  green:"#2f9e44", greenL:"#ebfbee",
  red:"#c92a2a", redL:"#fff5f5",
  cyan:"#0c8599", cyanL:"#e3fafc",
  orange:"#d9480f", orangeL:"#fff4e6",
  text:"#1a1b2e", textMid:"#495057", textSoft:"#868e96",
  shadow:"0 2px 12px rgba(59,91,219,0.10)",
  shadowLg:"0 6px 24px rgba(59,91,219,0.14)",
};

// ── TTS voice helper ───────────────────────────────────
function getUSVoice(): SpeechSynthesisVoice|null {
  const vs = window.speechSynthesis.getVoices();
  for (const n of ["Google US English","Microsoft David Desktop","Microsoft Zira Desktop","Alex","Samantha"]) {
    const f = vs.find(v=>v.name===n); if(f) return f;
  }
  return vs.find(v=>v.lang==="en-US") || vs.find(v=>v.lang.startsWith("en")) || null;
}

// ── Build TTS word-start positions ────────────────────
// Returns array of char indices where each whitespace-separated word starts in `tts`
function buildWordStarts(tts: string): number[] {
  const starts: number[] = [];
  const rx = /\S+/g; let m: RegExpExecArray|null;
  while((m = rx.exec(tts))!==null) starts.push(m.index);
  return starts;
}

// ══════════════════════════════════════════════════════
export default function NAQTQuizBowl() {

  // Config
  const [category,   setCategory]   = useState(CATEGORIES[0]);
  const [difficulty, setDifficulty] = useState(DIFFS[0].val);

  // Phase & question
  const [phase,    setPhase]    = useState<Phase>("idle");
  const [question, setQuestion] = useState<QBQuestion|null>(null);
  const [error,    setError]    = useState("");

  // Word-by-word display
  // displayTokens: each element is a word or "(*)" marker
  const [displayTokens, setDisplayTokens] = useState<string[]>([]);
  const [litWordIdx,    setLitWordIdx]    = useState(-1);   // index into displayTokens currently being spoken
  const ttsWordStartsRef = useRef<number[]>([]);             // char start of each word in TTS string
  const powerCharIdxRef  = useRef(Infinity);                 // char idx of (*) in TTS string
  const powerPassedRef   = useRef(false);

  // Countdown timer (dual: 15s reading, 10s buzz)
  const [countdown,    setCountdown]    = useState(0);
  const [countdownMax, setCountdownMax] = useState(0);
  const timerItvRef  = useRef<ReturnType<typeof setInterval>|null>(null);
  const timeUpFnRef  = useRef<()=>void>(()=>{});

  // Answer & result
  const [textAns,  setTextAns]  = useState("");
  const [voiceAns, setVoiceAns] = useState("");
  const [result,   setResult]   = useState<JudgeResult|null>(null);
  const [isPower,  setIsPower]  = useState(false);
  const [mode,     setMode]     = useState<"text"|"voice">("text");

  // Score
  const [score,    setScore]    = useState(0);
  const [qCount,   setQCount]   = useState(0);
  const [correct,  setCorrect]  = useState(0);
  const [powers,   setPowers]   = useState(0);

  // Log
  const [log, setLog] = useState<{role:"reader"|"student"|"judge";text:string}[]>([]);

  // DOM refs
  const inputRef  = useRef<HTMLInputElement>(null);
  const recognRef = useRef<InstanceType<SRCtor>|null>(null);
  const logRef    = useRef<HTMLDivElement>(null);

  // Sync refs (avoid stale closures in async callbacks / intervals)
  const phaseRef    = useRef<Phase>("idle");
  const questionRef = useRef<QBQuestion|null>(null);
  const isPowerRef  = useRef(false);
  const textAnsRef  = useRef("");

  useEffect(()=>{ phaseRef.current    = phase;    },[phase]);
  useEffect(()=>{ questionRef.current = question; },[question]);
  useEffect(()=>{ isPowerRef.current  = isPower;  },[isPower]);
  useEffect(()=>{ textAnsRef.current  = textAns;  },[textAns]);

  // Cleanup on unmount
  useEffect(()=>()=>{
    window.speechSynthesis?.cancel();
    recognRef.current?.abort();
    if(timerItvRef.current) clearInterval(timerItvRef.current);
  },[]);

  // ── addLog ────────────────────────────────────────────
  const addLog = useCallback((role:"reader"|"student"|"judge", text:string)=>{
    setLog(l=>[...l,{role,text}]);
    setTimeout(()=>logRef.current?.scrollTo({top:logRef.current.scrollHeight,behavior:"smooth"}),50);
  },[]);

  // ── speak ─────────────────────────────────────────────
  const speak = useCallback((text:string, onEnd?:()=>void)=>{
    window.speechSynthesis.cancel();
    const go=()=>{
      const u=new SpeechSynthesisUtterance(text);
      const v=getUSVoice(); if(v) u.voice=v;
      u.lang="en-US"; u.rate=0.9; u.pitch=1; u.volume=1;
      if(onEnd) u.onend=onEnd;
      window.speechSynthesis.speak(u);
    };
    window.speechSynthesis.getVoices().length===0
      ?(window.speechSynthesis.onvoiceschanged=go):go();
  },[]);

  // ── Timer helpers ─────────────────────────────────────
  const clearTimer = useCallback(()=>{
    if(timerItvRef.current){ clearInterval(timerItvRef.current); timerItvRef.current=null; }
    setCountdown(0); setCountdownMax(0);
  },[]);

  // startTimer(secs) — counts down, calls timeUpFnRef.current on zero
  const startTimer = useCallback((secs:number)=>{
    clearTimer();
    setCountdown(secs); setCountdownMax(secs);
    timerItvRef.current = setInterval(()=>{
      setCountdown(c=>{
        if(c<=1){
          clearInterval(timerItvRef.current!); timerItvRef.current=null;
          setTimeout(()=>timeUpFnRef.current(),0);
          return 0;
        }
        return c-1;
      });
    },1000);
  },[clearTimer]);

  // ── judgeAnswer ───────────────────────────────────────
  // Calls /api/judge — QB Reader check-answer + Anthropic fuzzy
  const judgeAnswer = useCallback(async(
    studentAns:string, correctAns:string, power:boolean
  ): Promise<JudgeResult>=>{
    if(!studentAns.trim()) return {correct:false,points:0,reason:"Time expired — no answer given."};
    try{
      const res=await fetch("/api/judge",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({answer:correctAns,studentAnswer:studentAns,isPower:power}),
      });
      const ct=res.headers.get("content-type")||"";
      if(!ct.includes("application/json")){
        // /api/judge route missing — fallback to simple match
        const n=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,"");
        const ok=n(correctAns)===n(studentAns)||n(correctAns).includes(n(studentAns));
        return {correct:ok,points:ok?(power?15:10):0,reason:ok?"Correct!":"Incorrect."};
      }
      const data=await res.json() as JudgeResult;
      return data;
    }catch{
      return {correct:false,points:0,reason:"Could not reach judge — marked incorrect."};
    }
  },[]);

  // ── submitAnswer ──────────────────────────────────────
  // Central answer submission — handles judging, scoring, log
  const submitAnswerFn = useCallback(async(ans?:string)=>{
    if(phaseRef.current==="answered"||phaseRef.current==="judging") return;
    clearTimer();
    window.speechSynthesis?.cancel();
    recognRef.current?.abort();

    const q=questionRef.current; if(!q) return;
    const power=isPowerRef.current;
    const studentAns=(ans??textAnsRef.current).trim();

    setPhase("judging");
    addLog("judge",studentAns?"🤔 Judging your answer…":"⏱ Time expired!");

    const jResult=await judgeAnswer(studentAns,q.answer,power);
    setResult(jResult);
    setPhase("answered");
    setQCount(c=>c+1);

    if(jResult.correct){
      setScore(s=>s+jResult.points);
      setCorrect(c=>c+1);
      if(power) setPowers(p=>p+1);
      addLog("judge",`✅ ${power?"⚡ POWER! ":""}${jResult.reason} "${q.answer}" — ${jResult.points} pts!`);
      speak(power?`Power! Correct! ${q.answer}. ${jResult.points} points.`:`Correct! ${q.answer}. ${jResult.points} points.`);
    } else {
      addLog("judge",`❌ ${jResult.reason} Correct answer: "${q.answer}".`);
      speak(`Incorrect. The answer is ${q.answer}.`);
    }
  },[clearTimer,judgeAnswer,addLog,speak]);

  // Keep a ref to submitAnswerFn so timer and buzz can always call latest
  const submitAnswerRef = useRef(submitAnswerFn);
  useEffect(()=>{ submitAnswerRef.current=submitAnswerFn; },[submitAnswerFn]);

  // ── handleTimeUp ─────────────────────────────────────
  const handleTimeUp = useCallback(()=>{
    const p=phaseRef.current;
    if(p==="answered"||p==="judging"||p==="idle"||p==="loading") return;
    addLog("judge","⏱ TIME'S UP!");
    speak("Time's up!");
    submitAnswerRef.current("");
  },[addLog,speak]);

  // Update timeUpFnRef whenever handleTimeUp changes
  useEffect(()=>{ timeUpFnRef.current=handleTimeUp; },[handleTimeUp]);

  // ── startVoiceAnswer ──────────────────────────────────
  const startVoiceAnswer = useCallback(()=>{
    const SR=(window as WinSR).SpeechRecognition||(window as WinSR).webkitSpeechRecognition;
    if(!SR){
      addLog("judge","Voice not supported in this browser. Please type.");
      setMode("text"); inputRef.current?.focus(); return;
    }
    const r:InstanceType<SRCtor>=new SR();
    r.lang="en-US"; r.interimResults=false; r.maxAlternatives=3;
    recognRef.current=r;
    setPhase("listening");
    addLog("reader","🎤 Listening…");
    r.onresult=(e:SREv)=>{
      const heard=e.results[0][0].transcript;
      setVoiceAns(heard);
      addLog("student",`"${heard}"`);
      setPhase("buzzed");
      submitAnswerRef.current(heard);
    };
    r.onerror=()=>{
      addLog("judge","Couldn't hear — please type your answer.");
      setPhase("buzzed"); setMode("text"); inputRef.current?.focus();
    };
    r.start();
  },[addLog]);

  // ── buzzIn ────────────────────────────────────────────
  const buzzIn = useCallback(()=>{
    if(phaseRef.current!=="reading") return;
    window.speechSynthesis?.cancel();
    clearTimer();
    const power=!powerPassedRef.current;
    setIsPower(power); isPowerRef.current=power;
    setPhase("buzzed");
    if(power){
      addLog("reader","⚡ POWER BUZZ! Answer for 15 pts!");
      speak("Power buzz!");
    } else {
      addLog("reader","Buzzed! Answer for 10 pts.");
      speak("Buzz!");
    }
    // Start 10-second buzz timer
    startTimer(10);
    setTimeout(()=>{ if(mode==="voice") startVoiceAnswer(); else inputRef.current?.focus(); },400);
  },[clearTimer,addLog,speak,startTimer,mode,startVoiceAnswer]);

  const buzzInRef = useRef(buzzIn);
  useEffect(()=>{ buzzInRef.current=buzzIn; },[buzzIn]);

  // SPACE bar → buzz
  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{
      if(e.code==="Space"&&phaseRef.current==="reading"){ e.preventDefault(); buzzInRef.current(); }
    };
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  },[]);

  // ── prepareWordDisplay ────────────────────────────────
  // Tokenises question for word-by-word highlighting
  // Also builds TTS string and word-start char positions
  const prepareWordDisplay = useCallback((qText:string)=>{
    // Split into display tokens (preserving (*) as its own token)
    const tokens: string[] = [];
    let buf="";
    for(let i=0;i<qText.length;i++){
      if(qText.slice(i,i+3)==="(*)"){
        if(buf.trim()) tokens.push(buf.trim());
        tokens.push("(*)");
        buf=""; i+=2;
      } else if(qText[i]===" "||qText[i]==="\n"){
        if(buf.trim()) tokens.push(buf.trim());
        buf="";
      } else {
        buf+=qText[i];
      }
    }
    if(buf.trim()) tokens.push(buf.trim());
    setDisplayTokens(tokens);
    setLitWordIdx(-1);

    // Build TTS string ((*) → "...")
    const tts=qText.replace(/\(\*\)/g,"...");
    ttsWordStartsRef.current = buildWordStarts(tts);

    // Power mark char position in TTS string
    const ppos=qText.indexOf("(*)");
    powerCharIdxRef.current = ppos>=0 ? ppos : Infinity;
    powerPassedRef.current  = ppos<0;
  },[]);

  // ── readQuestion (TTS with word sync) ────────────────
  const readQuestion = useCallback((qText:string)=>{
    const tts=qText.replace(/\(\*\)/g,"...");
    window.speechSynthesis.cancel();
    const go=()=>{
      const u=new SpeechSynthesisUtterance(tts);
      const v=getUSVoice(); if(v) u.voice=v;
      u.lang="en-US"; u.rate=0.85; u.pitch=1; u.volume=1;

      // Word-by-word sync via boundary event
      u.addEventListener("boundary",(e:SpeechSynthesisEvent)=>{
        const ci=e.charIndex;
        // Map charIndex → word index (binary search)
        const ws=ttsWordStartsRef.current;
        let lo=0,hi=ws.length-1,idx=0;
        while(lo<=hi){ const mid=(lo+hi)>>1; if(ws[mid]<=ci){idx=mid;lo=mid+1;}else hi=mid-1; }
        setLitWordIdx(idx);
        // Power mark tracking
        if(!powerPassedRef.current&&ci>=powerCharIdxRef.current) powerPassedRef.current=true;
      });

      u.onend=()=>{
        // Reading finished — start 15-second answer timer
        setLitWordIdx(Infinity);
        addLog("reader","Reading done. 15 seconds to buzz and answer!");
        startTimer(15);
      };
      window.speechSynthesis.speak(u);
    };
    window.speechSynthesis.getVoices().length===0
      ?(window.speechSynthesis.onvoiceschanged=go):go();
  },[addLog,startTimer]);

  // ── fetchQuestion ─────────────────────────────────────
  const fetchQuestion = useCallback(async()=>{
    setPhase("loading"); setError(""); setQuestion(null); setResult(null);
    setTextAns(""); setVoiceAns(""); setIsPower(false);
    setDisplayTokens([]); setLitWordIdx(-1);
    setLog([]); clearTimer();
    powerPassedRef.current=false; powerCharIdxRef.current=Infinity;
    window.speechSynthesis?.cancel(); recognRef.current?.abort();

    try{
      const res=await fetch("/api/question",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({category,difficulty}),
      });
      const ct=res.headers.get("content-type")||"";
      if(!ct.includes("application/json")){
        throw new Error(res.status===404
          ?"⚠️ API route missing — make sure app/api/question/route.ts exists in GitHub and Vercel redeployed."
          :`Server returned ${res.status}. Check Vercel logs.`);
      }
      const data=await res.json();
      if(data.error) throw new Error(data.error);
      const q=data as QBQuestion;
      setQuestion(q); questionRef.current=q;
      setPhase("reading");

      // Prepare word tokens for display
      prepareWordDisplay(q.question);

      addLog("reader",`📖 ${q.category}${q.subcategory?` / ${q.subcategory}`:""} · Set: ${q.setName||"QB Reader"}`);
      setTimeout(()=>{
        addLog("reader", q.question.replace(/\(\*\)/g,"★ [BUZZ] ★"));
        readQuestion(q.question);
      },500);
    }catch(e:unknown){
      setError(e instanceof Error?e.message:"Failed to load question. Please try again.");
      setPhase("idle");
    }
  },[category,difficulty,clearTimer,prepareWordDisplay,addLog,readQuestion]);

  // ── Keyboard: Enter to submit ─────────────────────────
  const handleKey=(e:React.KeyboardEvent)=>{
    if(e.key==="Enter"&&textAns.trim()){
      addLog("student",`"${textAns}"`);
      submitAnswerRef.current(textAns);
    }
  };

  // ── Derived ───────────────────────────────────────────
  const acc = qCount>0?Math.round((correct/qCount)*100):0;
  const timerPct = countdownMax>0?(countdown/countdownMax)*100:0;
  const timerColor = countdown<=3?C.red:countdown<=7?C.gold:C.green;
  const isBuzzTimer = phase==="buzzed"||phase==="listening";

  // ── Shared styles ─────────────────────────────────────
  const card: React.CSSProperties = {
    background:C.card,border:`1.5px solid ${C.border}`,
    borderRadius:16,padding:"20px",marginBottom:16,boxShadow:C.shadow,
  };
  const labelSt: React.CSSProperties = {
    display:"block",fontSize:"0.6rem",letterSpacing:"0.16em",
    textTransform:"uppercase",color:C.textSoft,marginBottom:4,
    fontFamily:"system-ui,sans-serif",
  };

  // Phase banner config
  type BannerCfg = {emoji:string; text:string; bg:string; color:string};
  const bannerMap: Record<Phase,BannerCfg> = {
    idle:     {emoji:"🎓",text:"Pick a category and tap Generate!",bg:C.cardAlt,color:C.textSoft},
    loading:  {emoji:"⏳",text:"Loading question from QB Reader…",  bg:C.blueL,  color:C.blue  },
    reading:  {emoji:"🎙",text:"Reading… buzz BEFORE ★ for 15 pts, AFTER ★ for 10 pts",bg:C.cyanL,color:C.cyan},
    buzzed:   isPower
              ?{emoji:"⚡",text:"POWER BUZZ — Answer within 10 seconds for 15 pts!",bg:C.purpleL,color:C.purple}
              :{emoji:"⏱",text:"Buzzed — Answer within 10 seconds for 10 pts!",bg:C.goldL,color:C.gold},
    listening:{emoji:"🎤",text:isPower?"Listening… ⚡ POWER active!":"Listening for your answer…",bg:C.purpleL,color:C.purple},
    judging:  {emoji:"🤔",text:"AI is judging your answer…",bg:C.cardAlt,color:C.blue},
    answered: result?.correct
              ?isPower
                ?{emoji:"⚡",text:`POWER CORRECT! +${result.points} points!`,bg:C.purpleL,color:C.purple}
                :{emoji:"🏆",text:`Correct! +${result?.points} points!`,bg:C.greenL,color:C.green}
              :{emoji:"📖",text:"Incorrect — 0 points",bg:C.redL,color:C.red},
  };
  const bn=bannerMap[phase];

  return (
    <>
      <style>{`
        *{box-sizing:border-box;}
        body{margin:0;-webkit-tap-highlight-color:transparent;}
        select,input,button{font-size:16px;font-family:inherit;-webkit-appearance:none;}
        .cfg-grid{display:grid;gap:12px;grid-template-columns:1fr 1fr 1fr;}
        .howto-row{display:grid;gap:8px;grid-template-columns:repeat(5,1fr);}
        .score-row{display:flex;gap:8px;flex-wrap:wrap;}
        @media(max-width:700px){
          .cfg-grid{grid-template-columns:1fr 1fr!important;}
          .howto-row{grid-template-columns:repeat(3,1fr)!important;}
          .hdr-inner{flex-direction:column;gap:8px!important;}
          .score-row{gap:5px!important;}
          .sp{padding:4px 7px!important;min-width:52px!important;}
          .sp-val{font-size:1rem!important;}
        }
        @media(max-width:420px){
          .cfg-grid{grid-template-columns:1fr!important;}
          .howto-row{grid-template-columns:repeat(2,1fr)!important;}
        }
        /* Word highlight states */
        .w-past{color:#1a1b2e;}
        .w-current{background:#ffd43b;color:#1a1b2e;border-radius:3px;padding:0 2px;font-weight:bold;}
        .w-future{color:#adb5bd;}
        .w-star{display:inline-flex;align-items:center;gap:3px;background:#f3f0ff;
          color:#6741d9;padding:2px 8px;border-radius:5px;font-weight:700;
          font-size:0.8em;border:1.5px solid #6741d990;margin:0 3px;vertical-align:middle;}
        @media(hover:hover){.gen-btn:hover{filter:brightness(1.08);transform:translateY(-1px);}}
        .gen-btn:active{opacity:0.85;}
      `}</style>

      <div style={{minHeight:"100vh",background:C.bg,color:C.text,
        fontFamily:"Georgia,'Times New Roman',serif"}}>

        {/* ══ HEADER ══ */}
        <header style={{background:"#fff",borderBottom:`1.5px solid ${C.border}`,
          position:"sticky",top:0,zIndex:50,boxShadow:C.shadow}}>
          <div className="hdr-inner" style={{maxWidth:900,margin:"0 auto",
            padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:"1.9rem"}}>🏆</span>
              <div>
                <div style={{fontWeight:"bold",fontSize:"1.05rem"}}>
                  NAQT <span style={{color:C.blue}}>Quiz Bowl</span> Trainer
                </div>
                <div style={{fontSize:"0.58rem",color:C.textSoft,letterSpacing:"0.14em",
                  textTransform:"uppercase",fontFamily:"system-ui,sans-serif"}}>
                  Powered by QB Reader
                </div>
              </div>
            </div>
            <div className="score-row">
              {([
                {v:score,       l:"Points",    c:C.gold  },
                {v:`${acc}%`,   l:"Accuracy",  c:C.blue  },
                {v:powers,      l:"⚡ Powers",  c:C.purple},
                {v:qCount,      l:"Questions", c:C.textMid},
              ] as {v:string|number;l:string;c:string}[]).map(({v,l,c})=>(
                <div key={l} className="sp" style={{textAlign:"center",padding:"5px 10px",
                  background:C.cardAlt,borderRadius:10,border:`1.5px solid ${C.border}`,minWidth:62}}>
                  <div className="sp-val" style={{fontSize:"1.1rem",fontWeight:"bold",color:c,lineHeight:1}}>{v}</div>
                  <div style={{fontSize:"0.55rem",color:C.textSoft,textTransform:"uppercase",
                    letterSpacing:"0.1em",fontFamily:"system-ui,sans-serif"}}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </header>

        <div style={{maxWidth:900,margin:"0 auto",padding:"18px 14px 40px"}}>

          {/* ══ PHASE BANNER ══ */}
          <div style={{background:bn.bg,border:`1.5px solid ${bn.color}30`,
            borderRadius:14,padding:"12px 18px",marginBottom:14,
            display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <span style={{fontSize:"1.5rem"}}>{bn.emoji}</span>
            <span style={{fontWeight:"bold",color:bn.color,fontSize:"0.97rem",
              fontFamily:"system-ui,sans-serif"}}>{bn.text}</span>
            {phase==="reading"&&(
              <span style={{marginLeft:"auto",background:"#fff",padding:"3px 10px",
                borderRadius:20,border:`1px solid ${C.border}`,fontSize:"0.72rem",
                color:C.textMid,fontFamily:"system-ui,sans-serif"}}>
                SPACE = Buzz In
              </span>
            )}
          </div>

          {/* ══ TIMER BAR ══ */}
          {(countdown>0)&&(
            <div style={{marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",marginBottom:5}}>
                <span style={{fontSize:"0.72rem",color:C.textSoft,
                  fontFamily:"system-ui,sans-serif",textTransform:"uppercase",letterSpacing:"0.1em"}}>
                  {isBuzzTimer?"⏱ Answer time":"⏳ Auto-answer in"}
                </span>
                <span style={{fontFamily:"'Courier New',monospace",fontSize:"1.8rem",
                  fontWeight:"bold",color:timerColor,lineHeight:1}}>
                  {countdown}s
                </span>
              </div>
              {/* Progress bar */}
              <div style={{background:C.border,borderRadius:99,height:10,overflow:"hidden"}}>
                <div style={{
                  width:`${timerPct}%`,height:"100%",
                  background:timerColor,
                  transition:"width 1s linear, background 0.3s",
                  borderRadius:99,
                }}/>
              </div>
              <div style={{fontSize:"0.68rem",color:C.textSoft,marginTop:3,
                fontFamily:"system-ui,sans-serif",textAlign:"right"}}>
                {isBuzzTimer
                  ?`Answer within ${countdown}s or score 0`
                  :`Press SPACE to buzz in within ${countdown}s`}
              </div>
            </div>
          )}

          {/* ══ CONFIG CARD ══ */}
          <div style={card}>
            <div className="cfg-grid" style={{marginBottom:14}}>
              {[
                {lbl:"Category",   val:category,   opts:CATEGORIES,              set:setCategory  },
                {lbl:"Difficulty", val:difficulty, opts:DIFFS.map(d=>d.label),   set:(v:string)=>setDifficulty(DIFFS.find(d=>d.label===v)?.val??v)},
              ].map(({lbl,val,opts,set})=>(
                <div key={lbl}>
                  <label style={labelSt}>{lbl}</label>
                  <select value={opts.find?.(o=>o===val)||val}
                    onChange={e=>set(e.target.value)}
                    style={{width:"100%",padding:"10px 12px",background:C.cardAlt,
                      border:`1.5px solid ${C.border}`,borderRadius:10,color:C.text,
                      outline:"none",cursor:"pointer"}}>
                    {opts.map(o=><option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <label style={labelSt}>Answer by</label>
                <div style={{display:"flex",gap:8,marginTop:2}}>
                  {(["text","voice"] as const).map(m=>(
                    <button key={m} onClick={()=>setMode(m)} style={{
                      flex:1,padding:"10px 8px",borderRadius:10,
                      border:`2px solid ${mode===m?C.blue:C.border}`,
                      background:mode===m?C.blue:"#fff",
                      color:mode===m?"#fff":C.textMid,
                      fontFamily:"system-ui,sans-serif",fontWeight:mode===m?700:400,
                      cursor:"pointer",fontSize:"0.88rem",transition:"all 0.15s"}}>
                      {m==="text"?"⌨️ Type":"🎤 Voice"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button className="gen-btn" onClick={fetchQuestion}
              disabled={phase==="loading"||phase==="reading"||phase==="judging"}
              style={{width:"100%",padding:"15px",borderRadius:12,border:"none",
                background:(phase==="loading"||phase==="reading"||phase==="judging")
                  ?"#dee2e6"
                  :"linear-gradient(135deg,#3b5bdb,#6741d9)",
                color:(phase==="loading"||phase==="reading"||phase==="judging")?"#868e96":"#fff",
                fontSize:"1.05rem",fontFamily:"system-ui,sans-serif",fontWeight:"bold",
                cursor:(phase==="loading"||phase==="reading"||phase==="judging")?"not-allowed":"pointer",
                boxShadow:(phase==="loading")?"none":C.shadowLg,transition:"all 0.2s"}}>
              {phase==="loading"?"⏳  Loading from QB Reader…":"⚡  Generate New Question"}
            </button>

            {error&&(
              <div style={{marginTop:12,padding:"13px 16px",background:C.redL,
                border:`1.5px solid ${C.red}40`,borderRadius:10,
                color:C.red,fontSize:"0.87rem",lineHeight:1.6,
                fontFamily:"system-ui,sans-serif"}}>
                {error}
              </div>
            )}
          </div>

          {/* ══ QUESTION CARD ══ */}
          {question&&(phase!=="idle")&&(
            <div style={{...card,
              border:`2px solid ${
                phase==="reading"?C.cyan:
                (phase==="buzzed"||phase==="listening")?C.gold:
                phase==="answered"?(result?.correct?(isPower?C.purple:C.green):C.red):C.border}`,
              transition:"border-color 0.3s"}}>

              {/* Category tags + buzz button */}
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <span style={{background:C.blueL,color:C.blue,padding:"3px 10px",
                    borderRadius:20,fontSize:"0.68rem",fontFamily:"monospace",
                    textTransform:"uppercase",fontWeight:600}}>
                    {question.category}
                  </span>
                  {question.subcategory&&(
                    <span style={{background:C.cardAlt,color:C.textMid,padding:"3px 10px",
                      borderRadius:20,fontSize:"0.68rem",fontFamily:"monospace",
                      textTransform:"uppercase"}}>
                      {question.subcategory}
                    </span>
                  )}
                  {question.setName&&(
                    <span style={{background:"#fff9db",color:C.gold,padding:"3px 10px",
                      borderRadius:20,fontSize:"0.66rem",fontFamily:"system-ui,sans-serif"}}>
                      📦 {question.setName}
                    </span>
                  )}
                </div>
                {phase==="reading"&&(
                  <button onClick={()=>buzzInRef.current()}
                    style={{padding:"10px 20px",borderRadius:10,
                      border:`2px solid ${C.purple}`,background:C.purpleL,color:C.purple,
                      fontSize:"0.95rem",fontFamily:"system-ui,sans-serif",
                      fontWeight:"bold",cursor:"pointer",boxShadow:C.shadow}}>
                    ⚡ Buzz In!
                  </button>
                )}
              </div>

              {/* ── Word-by-word question display ── */}
              <div style={{background:C.cardAlt,border:`1.5px solid ${C.border}`,
                borderRadius:12,padding:"18px 20px",marginBottom:16,
                lineHeight:2.0,fontSize:"clamp(0.95rem,2.5vw,1.08rem)"}}>
                {displayTokens.length===0?(
                  <span style={{color:C.textSoft}}>Loading question…</span>
                ):(
                  displayTokens.map((tok,i)=>{
                    if(tok==="(*)") return (
                      <span key={i} className="w-star">⚡ BUZZ HERE</span>
                    );
                    // Word state: past (already read), current (being spoken), future (not yet)
                    const state = litWordIdx===Infinity?"past"
                      : i<litWordIdx?"past"
                      : i===litWordIdx?"current"
                      : "future";
                    return (
                      <span key={i} className={`w-${state}`}>{tok}{" "}</span>
                    );
                  })
                )}
              </div>

              {/* Text answer input */}
              {phase==="buzzed"&&mode==="text"&&(
                <div>
                  <label style={labelSt}>Your Answer</label>
                  <div style={{display:"flex",gap:8}}>
                    <input ref={inputRef} value={textAns} autoFocus autoComplete="off"
                      onChange={e=>setTextAns(e.target.value)} onKeyDown={handleKey}
                      placeholder="Type answer and press Enter…"
                      style={{flex:1,padding:"13px 14px",background:"#fff",
                        border:`2px solid ${C.blue}`,borderRadius:10,
                        color:C.text,outline:"none",fontSize:"1rem"}}/>
                    <button onClick={()=>{addLog("student",`"${textAns}"`);submitAnswerRef.current(textAns);}}
                      disabled={!textAns.trim()}
                      style={{padding:"13px 18px",borderRadius:10,border:"none",
                        background:C.blue,color:"#fff",fontFamily:"system-ui,sans-serif",
                        fontWeight:"bold",cursor:textAns.trim()?"pointer":"not-allowed",
                        opacity:textAns.trim()?1:0.5,fontSize:"1rem",whiteSpace:"nowrap"}}>
                      Submit ↵
                    </button>
                  </div>
                  <p style={{fontSize:"0.72rem",color:C.textSoft,marginTop:5,
                    fontFamily:"system-ui,sans-serif"}}>
                    Press Enter or tap Submit · Typos OK — AI judges your answer
                  </p>
                </div>
              )}

              {/* Voice button */}
              {phase==="buzzed"&&mode==="voice"&&(
                <button onClick={startVoiceAnswer}
                  style={{width:"100%",padding:"18px",borderRadius:12,
                    border:`2px solid ${C.purple}`,background:C.purpleL,
                    color:C.purple,fontSize:"1.1rem",fontFamily:"system-ui,sans-serif",
                    fontWeight:"bold",cursor:"pointer"}}>
                  🎤 Tap to Speak Your Answer
                </button>
              )}

              {/* Listening indicator */}
              {phase==="listening"&&(
                <div style={{textAlign:"center",padding:"24px",background:C.purpleL,
                  borderRadius:12,border:`2px solid ${C.purple}`}}>
                  <div style={{fontSize:"3rem",marginBottom:8}}>🎤</div>
                  <div style={{color:C.purple,fontWeight:"bold",fontSize:"1.1rem",
                    fontFamily:"system-ui,sans-serif"}}>Listening…</div>
                  <div style={{color:C.textSoft,fontSize:"0.85rem",marginTop:4,
                    fontFamily:"system-ui,sans-serif"}}>Speak clearly — typos/accents handled by AI</div>
                </div>
              )}

              {/* Judging spinner */}
              {phase==="judging"&&(
                <div style={{textAlign:"center",padding:"24px",background:C.blueL,
                  borderRadius:12,border:`1.5px solid ${C.blue}30`}}>
                  <div style={{fontSize:"2.5rem",marginBottom:8}}>🤔</div>
                  <div style={{color:C.blue,fontWeight:"bold",fontSize:"1.05rem",
                    fontFamily:"system-ui,sans-serif"}}>AI is judging your answer…</div>
                  <div style={{color:C.textSoft,fontSize:"0.82rem",marginTop:4,
                    fontFamily:"system-ui,sans-serif"}}>
                    Checking QB Reader + Anthropic for typos &amp; close matches
                  </div>
                </div>
              )}

              {/* Result panel */}
              {phase==="answered"&&result&&(
                <div>
                  {/* Score banner */}
                  <div style={{
                    background:result.correct?(isPower?C.purpleL:C.greenL):C.redL,
                    border:`2px solid ${result.correct?(isPower?C.purple+"50":C.green+"50"):C.red+"50"}`,
                    borderRadius:12,padding:"16px 18px",marginBottom:14,
                    display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                    <div>
                      {result.correct&&isPower&&(
                        <div style={{display:"inline-flex",alignItems:"center",gap:5,
                          background:C.purple,color:"#fff",padding:"3px 12px",
                          borderRadius:20,fontSize:"0.7rem",fontWeight:"bold",
                          marginBottom:8,textTransform:"uppercase",letterSpacing:"0.1em",
                          fontFamily:"system-ui,sans-serif"}}>
                          ⚡ POWER — Early Buzz!
                        </div>
                      )}
                      <div style={{fontSize:"1.1rem",fontWeight:"bold",
                        fontFamily:"system-ui,sans-serif",
                        color:result.correct?(isPower?C.purple:C.green):C.red}}>
                        {result.correct
                          ?(isPower?`✓ POWER Correct! +${result.points} points`:`✓ Correct! +${result.points} points`)
                          :"✗ Incorrect — 0 points"}
                      </div>
                      <div style={{fontSize:"0.83rem",color:C.textMid,marginTop:4,
                        fontFamily:"system-ui,sans-serif"}}>
                        {result.reason}
                      </div>
                      {(voiceAns||textAns)&&(
                        <div style={{fontSize:"0.78rem",color:C.textSoft,marginTop:3,
                          fontFamily:"system-ui,sans-serif"}}>
                          You answered: <em>&quot;{voiceAns||textAns}&quot;</em>
                        </div>
                      )}
                    </div>
                    <div style={{fontSize:"2.2rem"}}>
                      {result.correct?(isPower?"⚡":"🏆"):"📖"}
                    </div>
                  </div>

                  {/* Correct answer */}
                  <div style={{background:C.goldL,border:`1.5px solid ${C.gold}50`,
                    borderRadius:12,padding:"14px 18px",marginBottom:14}}>
                    <div style={labelSt}>Correct Answer</div>
                    <div style={{fontSize:"1.3rem",color:C.gold,fontWeight:"bold"}}>
                      {question.answer}
                    </div>
                    <div style={{fontSize:"0.75rem",color:C.textMid,marginTop:4,
                      fontFamily:"system-ui,sans-serif"}}>
                      {question.category}{question.subcategory?` · ${question.subcategory}`:""} · {question.setName}
                    </div>
                  </div>

                  <button className="gen-btn" onClick={fetchQuestion}
                    style={{width:"100%",padding:"15px",borderRadius:12,border:"none",
                      background:"linear-gradient(135deg,#3b5bdb,#6741d9)",
                      color:"#fff",fontSize:"1.05rem",fontFamily:"system-ui,sans-serif",
                      fontWeight:"bold",cursor:"pointer",boxShadow:C.shadowLg}}>
                    ⚡ Next Question
                  </button>
                </div>
              )}

              {/* Skip reading */}
              {phase==="reading"&&(
                <div style={{textAlign:"center",marginTop:10}}>
                  <button onClick={()=>{
                    window.speechSynthesis?.cancel();
                    powerPassedRef.current=true;
                    setLitWordIdx(Infinity);
                    setPhase("buzzed");
                    startTimer(10);
                    setTimeout(()=>inputRef.current?.focus(),100);
                  }} style={{background:"none",border:`1px solid ${C.border}`,
                    borderRadius:8,padding:"7px 16px",color:C.textSoft,
                    fontSize:"0.8rem",fontFamily:"system-ui,sans-serif",cursor:"pointer"}}>
                    Skip reading → Answer now (no power, 10s timer)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ══ QUIZ LOG ══ */}
          {log.length>0&&(
            <div style={card}>
              <div style={labelSt}>📻 Live Quiz Room</div>
              <div ref={logRef} style={{maxHeight:185,overflowY:"auto",
                display:"flex",flexDirection:"column",gap:7}}>
                {log.map((e,i)=>(
                  <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                    <span style={{fontSize:"0.64rem",fontWeight:"bold",minWidth:58,paddingTop:3,
                      textTransform:"uppercase",fontFamily:"system-ui,sans-serif",
                      color:e.role==="reader"?C.cyan:e.role==="student"?C.blue:C.green}}>
                      {e.role==="reader"?"📖 Reader":e.role==="student"?"🙋 You":"⚖️ Judge"}
                    </span>
                    <span style={{fontSize:"0.88rem",color:C.text,lineHeight:1.6}}>{e.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ IDLE EMPTY STATE ══ */}
          {phase==="idle"&&(
            <div style={{textAlign:"center",padding:"40px 20px"}}>
              <div style={{fontSize:"4rem",marginBottom:12}}>🎓</div>
              <div style={{fontSize:"1.15rem",fontWeight:"bold",color:C.textMid,
                marginBottom:6,fontFamily:"system-ui,sans-serif"}}>
                Real NAQT Questions from QB Reader
              </div>
              <div style={{fontSize:"0.88rem",color:C.textSoft,
                fontFamily:"system-ui,sans-serif",lineHeight:1.6}}>
                Pick a category · tap Generate · buzz before ★ for Power (15 pts)
              </div>
            </div>
          )}

          {/* ══ SCORE SUMMARY ══ */}
          {qCount>0&&(
            <div style={{...card,padding:"16px"}}>
              <div style={{display:"flex",flexWrap:"wrap"}}>
                {[
                  {label:"Points",    val:score,        color:C.gold  },
                  {label:"Correct",   val:correct,      color:C.green },
                  {label:"⚡ Powers", val:powers,       color:C.purple},
                  {label:"Questions", val:qCount,       color:C.blue  },
                  {label:"Accuracy",  val:`${acc}%`,    color:acc>=70?C.green:acc>=40?C.gold:C.red},
                ].map(({label,val,color})=>(
                  <div key={label} style={{flex:"1 1 72px",textAlign:"center",
                    padding:"10px 6px",borderRight:`1px solid ${C.border}`}}>
                    <div style={{fontSize:"1.7rem",fontWeight:"bold",color}}>{val}</div>
                    <div style={{fontSize:"0.6rem",color:C.textSoft,textTransform:"uppercase",
                      letterSpacing:"0.1em",fontFamily:"system-ui,sans-serif"}}>{label}</div>
                  </div>
                ))}
                <div style={{display:"flex",alignItems:"center",padding:"0 12px"}}>
                  <button onClick={()=>{setScore(0);setQCount(0);setCorrect(0);setPowers(0);setLog([]);}}
                    style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,
                      padding:"6px 12px",color:C.textSoft,fontSize:"0.78rem",
                      fontFamily:"system-ui,sans-serif",cursor:"pointer"}}>
                    Reset
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ══ HOW TO USE ══ */}
          <div style={{...card,background:C.cardAlt}}>
            <div style={labelSt}>How to Use</div>
            <div className="howto-row">
              {[
                {icon:"📚",n:"1",title:"Pick Category", desc:"Choose topic & difficulty"},
                {icon:"🎙",n:"2",title:"Listen",        desc:"TTS reads word by word"},
                {icon:"⚡",n:"3",title:"Power Buzz",    desc:"Before ★ = 15 pts, 15s left"},
                {icon:"🔔",n:"4",title:"Normal Buzz",   desc:"After ★ = 10 pts, 10s timer"},
                {icon:"🤖",n:"5",title:"AI Judges",     desc:"Typos OK! AI checks answer"},
              ].map(({icon,n,title,desc})=>(
                <div key={n} style={{textAlign:"center",padding:"10px 6px",
                  background:"#fff",borderRadius:12,border:`1.5px solid ${C.border}`}}>
                  <div style={{fontSize:"1.5rem",marginBottom:3}}>{icon}</div>
                  <div style={{fontSize:"0.58rem",color:C.blue,fontWeight:"bold",
                    fontFamily:"system-ui,sans-serif"}}>Step {n}</div>
                  <div style={{fontSize:"0.74rem",color:C.text,fontWeight:"bold",
                    fontFamily:"system-ui,sans-serif",marginBottom:2}}>{title}</div>
                  <div style={{fontSize:"0.66rem",color:C.textMid,lineHeight:1.4,
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
