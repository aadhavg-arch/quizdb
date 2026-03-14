"use client";
// ═══════════════════════════════════════════════════════
// NAQT Quiz Bowl Trainer — QB Reader edition
// SubArea · No-repeat · Refresh & Next buttons · Word-by-word TTS
// 15s reading timer · 10s buzz timer · AI fuzzy judging
// ═══════════════════════════════════════════════════════
import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────
interface QBQuestion {
  _id: string; question: string; answer: string;
  category: string; subcategory: string; setName: string; difficulty: number;
}
interface JudgeResult { correct: boolean; points: number; reason: string; }
type Phase = "idle"|"loading"|"reading"|"buzzed"|"listening"|"judging"|"answered";

// ─── Web Speech API types (self-contained) ─────────────
interface SRAlt { readonly transcript:string; readonly confidence:number; }
interface SRRes  { readonly length:number; item(i:number):SRAlt; readonly [i:number]:SRAlt; }
interface SRList { readonly length:number; item(i:number):SRRes;  readonly [i:number]:SRRes; }
interface SREv extends Event { readonly results:SRList; }
type SRCtor = new ()=>{
  lang:string; interimResults:boolean; maxAlternatives:number;
  start():void; abort():void;
  onresult:((e:SREv)=>void)|null; onerror:((e:Event)=>void)|null;
};
interface WinSR extends Window { SpeechRecognition?:SRCtor; webkitSpeechRecognition?:SRCtor; }

// ─── QB Reader category → subcategory map ──────────────
const SUBJECTS: Record<string, string[]> = {
  "History":      ["All Sub-Areas","American History","Ancient History","European History","World History","Other History"],
  "Science":      ["All Sub-Areas","Biology","Chemistry","Physics","Math","Earth Science","Computer Science","Other Science"],
  "Literature":   ["All Sub-Areas","American Literature","British Literature","European Literature","World Literature","Other Literature"],
  "Fine Arts":    ["All Sub-Areas","Visual Fine Arts","Auditory Fine Arts","Other Fine Arts"],
  "Mythology":    ["All Sub-Areas"],
  "Philosophy":   ["All Sub-Areas"],
  "Social Science":["All Sub-Areas","Economics","Psychology","Linguistics"],
  "Geography":    ["All Sub-Areas"],
  "Current Events":["All Sub-Areas"],
  "Pop Culture":  ["All Sub-Areas"],
};
const CATEGORIES = Object.keys(SUBJECTS);

const DIFFS = [
  {label:"Middle School", val:"1"},
  {label:"Easy HS",       val:"2"},
  {label:"Regular HS",    val:"3"},
  {label:"Hard HS",       val:"4"},
];

// ─── Design tokens ─────────────────────────────────────
const C = {
  bg:"#eef0fb", card:"#ffffff", cardAlt:"#f6f7fd",
  border:"#dde1f5",
  blue:"#3b5bdb", blueL:"#edf2ff",
  purple:"#6741d9", purpleL:"#f3f0ff",
  gold:"#e67700", goldL:"#fff3bf",
  green:"#2f9e44", greenL:"#ebfbee",
  red:"#c92a2a", redL:"#fff5f5",
  cyan:"#0c8599", cyanL:"#e3fafc",
  text:"#1a1b2e", textMid:"#495057", textSoft:"#868e96",
  shadow:"0 2px 12px rgba(59,91,219,0.10)",
  shadowLg:"0 6px 24px rgba(59,91,219,0.14)",
};

// ─── TTS helper ─────────────────────────────────────────
function getUSVoice():SpeechSynthesisVoice|null {
  const vs=window.speechSynthesis.getVoices();
  for(const n of["Google US English","Microsoft David Desktop","Microsoft Zira Desktop","Alex","Samantha"]){
    const f=vs.find(v=>v.name===n); if(f) return f;
  }
  return vs.find(v=>v.lang==="en-US")||vs.find(v=>v.lang.startsWith("en"))||null;
}

// ─── Build word-start char positions from a string ──────
function buildWordStarts(s:string):number[]{
  const r:number[]=[]; const rx=/\S+/g; let m:RegExpExecArray|null;
  while((m=rx.exec(s))!==null) r.push(m.index); return r;
}

// ═══════════════════════════════════════════════════════
export default function NAQTQuizBowl(){

  // ── Config ──
  const [category,   setCategory]   = useState(CATEGORIES[0]);
  const [subArea,    setSubArea]    = useState("All Sub-Areas");
  const [difficulty, setDifficulty] = useState(DIFFS[0].val);

  // When category changes, reset subArea
  useEffect(()=>setSubArea("All Sub-Areas"),[category]);

  // ── No-repeat: track seen question IDs ──
  const usedIdsRef = useRef<string[]>([]);

  // ── Phase & question ──
  const [phase,    setPhase]    = useState<Phase>("idle");
  const [question, setQuestion] = useState<QBQuestion|null>(null);
  const [error,    setError]    = useState("");

  // ── Word-by-word display ──
  const [displayTokens, setDisplayTokens] = useState<string[]>([]);
  const [litWordIdx,    setLitWordIdx]    = useState(-1);
  const ttsWordStartsRef = useRef<number[]>([]);
  const powerCharIdxRef  = useRef(Infinity);
  const powerPassedRef   = useRef(false);

  // ── Countdown timer ──
  const [countdown,    setCountdown]    = useState(0);
  const [countdownMax, setCountdownMax] = useState(0);
  const timerItvRef  = useRef<ReturnType<typeof setInterval>|null>(null);
  const timeUpFnRef  = useRef<()=>void>(()=>{});

  // ── Answer ──
  const [textAns,  setTextAns]  = useState("");
  const [voiceAns, setVoiceAns] = useState("");
  const [result,   setResult]   = useState<JudgeResult|null>(null);
  const [isPower,  setIsPower]  = useState(false);
  const [mode,     setMode]     = useState<"text"|"voice">("text");
  const [isPaused, setIsPaused] = useState(false);

  // ── Score ──
  const [score,   setScore]   = useState(0);
  const [qCount,  setQCount]  = useState(0);
  const [correct, setCorrect] = useState(0);
  const [powers,  setPowers]  = useState(0);

  // ── Hint (AI clue panel shown after answering) ──
  const [hint,        setHint]        = useState("");
  const [hintLoading, setHintLoading] = useState(false);

  // ── DOM refs ──
  const inputRef  = useRef<HTMLInputElement>(null);
  const recognRef = useRef<InstanceType<SRCtor>|null>(null);

  // ── Sync refs (avoid stale closures) ──
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

  // ── addLog (no-op — log panel removed, kept as stable no-op for dep arrays) ──
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const addLog=useCallback((_role:"reader"|"student"|"judge",_text:string)=>{},[]);

  // ── speak ──
  const speak=useCallback((text:string,onEnd?:()=>void)=>{
    window.speechSynthesis.cancel();
    const go=()=>{
      const u=new SpeechSynthesisUtterance(text);
      const v=getUSVoice(); if(v) u.voice=v;
      u.lang="en-US"; u.rate=0.9; u.pitch=1; u.volume=1;
      if(onEnd) u.onend=onEnd;
      window.speechSynthesis.speak(u);
    };
    window.speechSynthesis.getVoices().length===0?(window.speechSynthesis.onvoiceschanged=go):go();
  },[]);

  // ── Timer ──
  const clearTimer=useCallback(()=>{
    if(timerItvRef.current){clearInterval(timerItvRef.current);timerItvRef.current=null;}
    setCountdown(0); setCountdownMax(0);
  },[]);

  const startTimer=useCallback((secs:number)=>{
    clearTimer();
    setCountdown(secs); setCountdownMax(secs);
    timerItvRef.current=setInterval(()=>{
      setCountdown(c=>{
        if(c<=1){
          clearInterval(timerItvRef.current!); timerItvRef.current=null;
          setTimeout(()=>timeUpFnRef.current(),0); return 0;
        }
        return c-1;
      });
    },1000);
  },[clearTimer]);

  // ── judgeAnswer ──
  const judgeAnswer=useCallback(async(studentAns:string,correctAns:string,power:boolean):Promise<JudgeResult>=>{
    if(!studentAns.trim()) return{correct:false,points:0,reason:"Time expired — no answer given."};
    try{
      const res=await fetch("/api/judge",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({answer:correctAns,studentAnswer:studentAns,isPower:power}),
      });
      const ct=res.headers.get("content-type")||"";
      if(!ct.includes("application/json")){
        const n=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,"");
        const ok=n(correctAns)===n(studentAns)||n(correctAns).includes(n(studentAns));
        return{correct:ok,points:ok?(power?15:10):0,reason:ok?"Correct!":"Incorrect."};
      }
      return await res.json() as JudgeResult;
    }catch{
      return{correct:false,points:0,reason:"Judge unavailable — marked incorrect."};
    }
  },[]);

  // ── submitAnswerFn ──
  const submitAnswerFn=useCallback(async(ans?:string)=>{
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
    // Fetch AI hint clue in background
    setHint(""); setHintLoading(true);
    fetch("/api/hint",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        question:q.question, answer:q.answer,
        category:q.category, subcategory:q.subcategory,
        studentAnswer:studentAns, correct:jResult.correct,
      }),
    }).then(r=>r.json()).then((d:{hint?:string})=>{
      setHint(d.hint||""); setHintLoading(false);
    }).catch(()=>setHintLoading(false));
    if(jResult.correct){
      setScore(s=>s+jResult.points); setCorrect(c=>c+1);
      if(power) setPowers(p=>p+1);
      addLog("judge",`✅ ${power?"⚡ POWER! ":""}${jResult.reason} "${q.answer}" — ${jResult.points} pts!`);
      speak(power?`Power! Correct! ${jResult.points} points.`:`Correct! ${jResult.points} points.`);
    }else{
      addLog("judge",`❌ ${jResult.reason} Answer: "${q.answer}".`);
      speak(`Incorrect. The answer is ${q.answer}.`);
    }
  },[clearTimer,judgeAnswer,addLog,speak]);

  const submitAnswerRef=useRef(submitAnswerFn);
  useEffect(()=>{submitAnswerRef.current=submitAnswerFn;},[submitAnswerFn]);

  // ── Time-up handler ──
  const handleTimeUp=useCallback(()=>{
    const p=phaseRef.current;
    if(p==="answered"||p==="judging"||p==="idle"||p==="loading") return;
    addLog("judge","⏱ TIME'S UP!");
    speak("Time's up!");
    submitAnswerRef.current("");
  },[addLog,speak]);
  useEffect(()=>{timeUpFnRef.current=handleTimeUp;},[handleTimeUp]);

  // ── startVoiceAnswer ──
  const startVoiceAnswer=useCallback(()=>{
    const SR=(window as WinSR).SpeechRecognition||(window as WinSR).webkitSpeechRecognition;
    if(!SR){
      addLog("judge","Voice not supported here. Please type."); setMode("text"); inputRef.current?.focus(); return;
    }
    const r:InstanceType<SRCtor>=new SR();
    r.lang="en-US"; r.interimResults=false; r.maxAlternatives=3;
    recognRef.current=r; setPhase("listening");
    addLog("reader","🎤 Listening…");
    r.onresult=(e:SREv)=>{
      const heard=e.results[0][0].transcript;
      setVoiceAns(heard); addLog("student",`"${heard}"`);
      setPhase("buzzed"); submitAnswerRef.current(heard);
    };
    r.onerror=()=>{ addLog("judge","Couldn't hear — please type."); setPhase("buzzed"); setMode("text"); inputRef.current?.focus(); };
    r.start();
  },[addLog]);

  // ── buzzIn ──
  const buzzIn=useCallback(()=>{
    if(phaseRef.current!=="reading") return;
    window.speechSynthesis?.cancel(); clearTimer();
    const power=!powerPassedRef.current;
    setIsPower(power); isPowerRef.current=power;
    setPhase("buzzed");
    if(power){ addLog("reader","⚡ POWER BUZZ! 15 pts if correct!"); speak("Power buzz!"); }
    else      { addLog("reader","Buzzed! 10 pts if correct.");        speak("Buzz!"); }
    startTimer(10);
    setTimeout(()=>{ if(mode==="voice") startVoiceAnswer(); else inputRef.current?.focus(); },400);
  },[clearTimer,addLog,speak,startTimer,mode,startVoiceAnswer]);

  const buzzInRef=useRef(buzzIn);
  useEffect(()=>{buzzInRef.current=buzzIn;},[buzzIn]);

  // SPACE = buzz
  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{ if(e.code==="Space"&&phaseRef.current==="reading"){e.preventDefault();buzzInRef.current();} };
    window.addEventListener("keydown",h); return()=>window.removeEventListener("keydown",h);
  },[]);

  // ── prepareWordDisplay ──
  const prepareWordDisplay=useCallback((qText:string)=>{
    const tokens:string[]=[]; let buf="";
    for(let i=0;i<qText.length;i++){
      if(qText.slice(i,i+3)==="(*)"){
        if(buf.trim()) tokens.push(buf.trim()); tokens.push("(*)"); buf=""; i+=2;
      }else if(qText[i]===" "||qText[i]==="\n"){
        if(buf.trim()) tokens.push(buf.trim()); buf="";
      }else buf+=qText[i];
    }
    if(buf.trim()) tokens.push(buf.trim());
    setDisplayTokens(tokens); setLitWordIdx(-1);
    const tts=qText.replace(/\(\*\)/g,"...");
    ttsWordStartsRef.current=buildWordStarts(tts);
    const ppos=qText.indexOf("(*)");
    powerCharIdxRef.current=ppos>=0?ppos:Infinity;
    powerPassedRef.current=ppos<0;
  },[]);

  // ── readQuestion (TTS with word sync) ──
  const readQuestion=useCallback((qText:string)=>{
    const tts=qText.replace(/\(\*\)/g,"...");
    window.speechSynthesis.cancel();
    const go=()=>{
      const u=new SpeechSynthesisUtterance(tts);
      const v=getUSVoice(); if(v) u.voice=v;
      u.lang="en-US"; u.rate=0.85; u.pitch=1; u.volume=1;
      u.addEventListener("boundary",(e:SpeechSynthesisEvent)=>{
        const ci=e.charIndex;
        const ws=ttsWordStartsRef.current;
        let lo=0,hi=ws.length-1,idx=0;
        while(lo<=hi){const mid=(lo+hi)>>1;if(ws[mid]<=ci){idx=mid;lo=mid+1;}else hi=mid-1;}
        setLitWordIdx(idx);
        if(!powerPassedRef.current&&ci>=powerCharIdxRef.current) powerPassedRef.current=true;
      });
      u.onend=()=>{
        setLitWordIdx(Infinity);
        addLog("reader","Reading done — 15 seconds to buzz and answer!");
        startTimer(15);
      };
      window.speechSynthesis.speak(u);
    };
    window.speechSynthesis.getVoices().length===0?(window.speechSynthesis.onvoiceschanged=go):go();
  },[addLog,startTimer]);

  // ── Core fetch function (used by Generate, Refresh, Next) ──
  const doFetch=useCallback(async(resetHistory=false)=>{
    if(resetHistory) usedIdsRef.current=[];
    setPhase("loading"); setError(""); setQuestion(null); setResult(null);
    setHint(""); setHintLoading(false); setIsPaused(false);
    setTextAns(""); setVoiceAns(""); setIsPower(false);
    setDisplayTokens([]); setLitWordIdx(-1); clearTimer();
    powerPassedRef.current=false; powerCharIdxRef.current=Infinity;
    window.speechSynthesis?.cancel(); recognRef.current?.abort();

    try{
      const res=await fetch("/api/question",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          category, subArea: subArea==="All Sub-Areas"?"":subArea,
          difficulty, usedIds:usedIdsRef.current,
        }),
      });
      const ct=res.headers.get("content-type")||"";
      if(!ct.includes("application/json")){
        throw new Error(res.status===404
          ?"⚠️ API route not found. Make sure app/api/question/route.ts exists in GitHub and Vercel redeployed."
          :`Server error ${res.status}. Check Vercel logs.`);
      }
      const data=await res.json();
      if(data.error) throw new Error(data.error);
      const q=data as QBQuestion;

      // Track this question as used
      if(q._id) usedIdsRef.current=[...usedIdsRef.current.slice(-99), q._id];

      setQuestion(q); questionRef.current=q; setPhase("reading");
      addLog("reader",`📖 ${q.category}${q.subcategory?` / ${q.subcategory}`:""} · ${q.setName||"QB Reader"}`);
      setTimeout(()=>{ addLog("reader",q.question.replace(/\(\*\)/g,"★")); prepareWordDisplay(q.question); readQuestion(q.question); },500);
    }catch(e:unknown){
      setError(e instanceof Error?e.message:"Failed to load question. Please try again.");
      setPhase("idle");
    }
  },[category,subArea,difficulty,clearTimer,addLog,prepareWordDisplay,readQuestion]);

  // Expose as named buttons
  const fetchQuestion   = useCallback(()=>doFetch(false),[doFetch]);
  const refreshQuestion = useCallback(()=>doFetch(false),[doFetch]);
  const resetAndFetch   = useCallback(()=>doFetch(true), [doFetch]);

  // ── Pause / Resume TTS reading ──
  const togglePause = useCallback(()=>{
    if(phaseRef.current !== "reading") return;
    if(!isPaused){
      window.speechSynthesis.pause();
      setIsPaused(true);
    } else {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  },[isPaused]);

  // Enter key submit
  const handleKey=(e:React.KeyboardEvent)=>{
    if(e.key==="Enter"&&textAns.trim()){ submitAnswerRef.current(textAns); }
  };

  // ── Derived ──
  const acc=qCount>0?Math.round((correct/qCount)*100):0;
  const timerPct=countdownMax>0?(countdown/countdownMax)*100:0;
  const timerColor=countdown<=3?C.red:countdown<=7?C.gold:C.green;
  const isBuzzTimer=phase==="buzzed"||phase==="listening";
  const isActive=phase==="reading"||phase==="buzzed"||phase==="listening"||phase==="judging";
  const subAreaOpts=SUBJECTS[category]??["All Sub-Areas"];

  // ── Shared styles ──
  const card:React.CSSProperties={
    background:C.card,border:`1.5px solid ${C.border}`,
    borderRadius:16,padding:"20px",marginBottom:16,boxShadow:C.shadow,
  };
  const lbl:React.CSSProperties={
    display:"block",fontSize:"0.6rem",letterSpacing:"0.16em",
    textTransform:"uppercase",color:C.textSoft,marginBottom:4,fontFamily:"system-ui,sans-serif",
  };
  const selectSt:React.CSSProperties={
    width:"100%",padding:"10px 12px",background:C.cardAlt,
    border:`1.5px solid ${C.border}`,borderRadius:10,color:C.text,
    outline:"none",cursor:"pointer",fontSize:"16px",fontFamily:"system-ui,sans-serif",
  };

  // Phase banner
  type BannerCfg={emoji:string;text:string;bg:string;color:string};
  const bannerMap:Record<Phase,BannerCfg>={
    idle:     {emoji:"🎓",text:"Pick a category and tap Generate!",bg:C.cardAlt,color:C.textSoft},
    loading:  {emoji:"⏳",text:"Loading from QB Reader…",bg:C.blueL,color:C.blue},
    reading:  {emoji:"🎙",text:"Reading… buzz BEFORE ★ = 15 pts | AFTER ★ = 10 pts",bg:C.cyanL,color:C.cyan},
    buzzed:   isPower
              ?{emoji:"⚡",text:"POWER BUZZ — Answer within 10s for 15 pts!",bg:C.purpleL,color:C.purple}
              :{emoji:"⏱",text:"Buzzed — Answer within 10s for 10 pts!",bg:C.goldL,color:C.gold},
    listening:{emoji:"🎤",text:isPower?"Listening… ⚡ POWER active!":"Listening for your answer…",bg:C.purpleL,color:C.purple},
    judging:  {emoji:"🤔",text:"AI is judging your answer…",bg:C.cardAlt,color:C.blue},
    answered: result?.correct
              ?isPower
                ?{emoji:"⚡",text:`POWER CORRECT! +${result.points} pts!`,bg:C.purpleL,color:C.purple}
                :{emoji:"🏆",text:`Correct! +${result?.points} pts!`,bg:C.greenL,color:C.green}
              :{emoji:"📖",text:"Incorrect — 0 points",bg:C.redL,color:C.red},
  };
  const bn=bannerMap[phase];

  return(
    <>
      <style>{`
        *{box-sizing:border-box;}
        body{margin:0;-webkit-tap-highlight-color:transparent;}
        select,input,button{font-size:16px;font-family:inherit;-webkit-appearance:none;}
        /* 4-col config grid: Category | Sub-Area | Difficulty | Answer by */
        .cfg-grid{display:grid;gap:12px;grid-template-columns:1fr 1fr 1fr 1fr;}
        .howto-row{display:grid;gap:8px;grid-template-columns:repeat(5,1fr);}
        .score-row{display:flex;gap:8px;flex-wrap:wrap;}
        @media(max-width:800px){
          .cfg-grid{grid-template-columns:1fr 1fr!important;}
          .howto-row{grid-template-columns:repeat(3,1fr)!important;}
          .hdr-inner{flex-direction:column;gap:8px!important;}
          .sp{padding:4px 7px!important;min-width:52px!important;}
        }
        @media(max-width:450px){
          .cfg-grid{grid-template-columns:1fr!important;}
          .howto-row{grid-template-columns:repeat(2,1fr)!important;}
        }
        /* Word highlight */
        .w-past{color:#1a1b2e;}
        .w-current{background:#ffd43b;color:#1a1b2e;border-radius:3px;padding:1px 3px;font-weight:700;box-shadow:0 0 0 2px #ffd43b66;}
        .w-star{display:inline-flex;align-items:center;gap:4px;background:#fff0f3;
          color:#c92a2a;padding:2px 10px;border-radius:6px;font-weight:800;
          font-size:0.78em;border:2px solid #c92a2a80;margin:0 4px;vertical-align:middle;
          letter-spacing:0.04em;}
        @keyframes popIn{0%{background:#ffe066;transform:scale(1.12)}100%{background:#ffd43b;transform:scale(1)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @media(hover:hover){.gbtn:hover{filter:brightness(1.08);transform:translateY(-1px);}}
        .gbtn:active{opacity:0.85;}
        .ibtn{background:none;border:1.5px solid;border-radius:10px;
          padding:10px 16px;cursor:pointer;font-weight:600;transition:all 0.15s;font-family:system-ui,sans-serif;}
        @media(hover:hover){.ibtn:hover{filter:brightness(0.94);}}
      `}</style>

      <div style={{minHeight:"100vh",background:C.bg,color:C.text,
        fontFamily:"Georgia,'Times New Roman',serif"}}>

        {/* ══ HEADER ══ */}
        <header style={{background:"#fff",borderBottom:`1.5px solid ${C.border}`,
          position:"sticky",top:0,zIndex:50,boxShadow:C.shadow}}>
          <div className="hdr-inner" style={{maxWidth:980,margin:"0 auto",
            padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:"1.9rem"}}>🏆</span>
              <div>
                <div style={{fontWeight:"bold",fontSize:"1.05rem"}}>
                  NAQT <span style={{color:C.blue}}>Quiz Bowl</span> Trainer
                </div>
                <div style={{fontSize:"0.58rem",color:C.textSoft,letterSpacing:"0.14em",
                  textTransform:"uppercase",fontFamily:"system-ui,sans-serif"}}>
                  Powered by QB Reader · {usedIdsRef.current.length} seen
                </div>
              </div>
            </div>
            <div className="score-row">
              {([
                {v:score,     l:"Points",    c:C.gold  },
                {v:`${acc}%`, l:"Accuracy",  c:C.blue  },
                {v:powers,    l:"⚡ Powers",  c:C.purple},
                {v:qCount,    l:"Questions", c:C.textMid},
              ] as {v:string|number;l:string;c:string}[]).map(({v,l,c})=>(
                <div key={l} className="sp" style={{textAlign:"center",padding:"5px 10px",
                  background:C.cardAlt,borderRadius:10,border:`1.5px solid ${C.border}`,minWidth:62}}>
                  <div style={{fontSize:"1.1rem",fontWeight:"bold",color:c,lineHeight:1}}>{v}</div>
                  <div style={{fontSize:"0.55rem",color:C.textSoft,textTransform:"uppercase",
                    letterSpacing:"0.1em",fontFamily:"system-ui,sans-serif"}}>{l}</div>
                </div>
              ))}
              {/* Logout */}
              <button onClick={async()=>{
                await fetch("/api/auth",{method:"DELETE"});
                window.location.href="/login";
              }} style={{padding:"6px 12px",borderRadius:9,border:`1.5px solid ${C.border}`,
                background:"#fff",color:C.textSoft,cursor:"pointer",fontSize:"0.78rem",
                fontFamily:"system-ui,sans-serif",whiteSpace:"nowrap",
                display:"flex",alignItems:"center",gap:5}}>
                🚪 Sign Out
              </button>
            </div>
          </div>
        </header>

        <div style={{maxWidth:980,margin:"0 auto",padding:"18px 14px 40px"}}>

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
          {countdown>0&&(
            <div style={{marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                <span style={{fontSize:"0.7rem",color:C.textSoft,fontFamily:"system-ui,sans-serif",
                  textTransform:"uppercase",letterSpacing:"0.1em"}}>
                  {isBuzzTimer?"⏱ Answer timer":"⏳ Time to buzz"}
                </span>
                <span style={{fontFamily:"'Courier New',monospace",fontSize:"1.9rem",
                  fontWeight:"bold",color:timerColor,lineHeight:1}}>{countdown}s</span>
              </div>
              <div style={{background:C.border,borderRadius:99,height:12,overflow:"hidden"}}>
                <div style={{width:`${timerPct}%`,height:"100%",background:timerColor,
                  transition:"width 1s linear, background 0.3s",borderRadius:99}}/>
              </div>
              <div style={{fontSize:"0.67rem",color:C.textSoft,marginTop:3,textAlign:"right",
                fontFamily:"system-ui,sans-serif"}}>
                {isBuzzTimer?`Answer within ${countdown}s — timeout = 0 pts`:`Buzz within ${countdown}s or miss the question`}
              </div>
            </div>
          )}

          {/* ══ CONFIG CARD ══ */}
          <div style={card}>

            {/* 4-column config grid */}
            <div className="cfg-grid" style={{marginBottom:14}}>

              {/* Category */}
              <div>
                <label style={lbl}>Category</label>
                <select style={selectSt} value={category} onChange={e=>setCategory(e.target.value)}>
                  {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Sub-Area */}
              <div>
                <label style={lbl}>Sub-Area</label>
                <select style={selectSt} value={subArea} onChange={e=>setSubArea(e.target.value)}>
                  {subAreaOpts.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Difficulty */}
              <div>
                <label style={lbl}>Difficulty</label>
                <select style={selectSt} value={difficulty} onChange={e=>setDifficulty(e.target.value)}>
                  {DIFFS.map(d=><option key={d.val} value={d.val}>{d.label}</option>)}
                </select>
              </div>

              {/* Answer mode */}
              <div>
                <label style={lbl}>Answer by</label>
                <div style={{display:"flex",gap:8}}>
                  {(["text","voice"] as const).map(m=>(
                    <button key={m} onClick={()=>setMode(m)} style={{
                      flex:1,padding:"10px 6px",borderRadius:10,
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

            {/* Action buttons row */}
            <div style={{display:"grid",gridTemplateColumns:"1fr auto auto auto auto",gap:10}}>

              {/* Generate (primary) */}
              <button className="gbtn" onClick={fetchQuestion}
                disabled={isActive}
                style={{padding:"14px",borderRadius:12,border:"none",
                  background:isActive?"#dee2e6":"linear-gradient(135deg,#3b5bdb,#6741d9)",
                  color:isActive?"#868e96":"#fff",fontSize:"1rem",
                  fontFamily:"system-ui,sans-serif",fontWeight:"bold",
                  cursor:isActive?"not-allowed":"pointer",
                  boxShadow:isActive?"none":C.shadowLg,transition:"all 0.2s"}}>
                {phase==="loading"?"⏳ Loading…":"⚡ Generate Question"}
              </button>

              {/* Next Question — enabled only after answering */}
              <button className="ibtn" onClick={fetchQuestion}
                disabled={phase!=="answered"}
                style={{borderColor:C.purple,color:C.purple,
                  opacity:phase==="answered"?1:0.35,
                  background:phase==="answered"?C.purpleL:"#f1f3f5",
                  fontSize:"0.92rem",whiteSpace:"nowrap",padding:"10px 16px"}}>
                ➡️ Next
              </button>

              {/* Pause / Start — only active while reading */}
              <button className="ibtn" onClick={togglePause}
                disabled={phase!=="reading"}
                style={{
                  borderColor: isPaused ? C.green  : C.gold,
                  color:        isPaused ? C.green  : C.gold,
                  background:   isPaused ? C.greenL : C.goldL,
                  opacity: phase==="reading" ? 1 : 0.35,
                  fontSize:"0.92rem", whiteSpace:"nowrap", padding:"10px 16px",
                  transition:"all 0.2s",
                }}>
                {isPaused ? "▶️ Start" : "⏸ Pause"}
              </button>

              {/* Refresh — new random question, same settings */}
              <button className="ibtn" onClick={refreshQuestion}
                disabled={isActive}
                style={{borderColor:C.cyan,color:C.cyan,
                  opacity:isActive?0.4:1,
                  background:isActive?"#f1f3f5":C.cyanL,
                  fontSize:"0.92rem",whiteSpace:"nowrap",padding:"10px 16px"}}>
                🔄 Refresh
              </button>

              {/* Reset history */}
              <button className="ibtn" onClick={resetAndFetch}
                disabled={isActive}
                style={{borderColor:C.textSoft,color:C.textSoft,
                  opacity:isActive?0.4:1,background:"#fff",
                  fontSize:"0.92rem",whiteSpace:"nowrap",padding:"10px 12px"}}>
                🗑️ Reset
              </button>
            </div>

            {/* Seen-count hint */}
            {usedIdsRef.current.length>0&&(
              <div style={{marginTop:10,fontSize:"0.72rem",color:C.textSoft,
                fontFamily:"system-ui,sans-serif",textAlign:"center"}}>
                {usedIdsRef.current.length} question{usedIdsRef.current.length>1?"s":""} seen this session · tap 🗑️ Reset to start fresh
              </div>
            )}

            {error&&(
              <div style={{marginTop:12,padding:"13px 16px",background:C.redL,
                border:`1.5px solid ${C.red}40`,borderRadius:10,color:C.red,
                fontSize:"0.87rem",lineHeight:1.6,fontFamily:"system-ui,sans-serif"}}>
                {error}
              </div>
            )}
          </div>

          {/* ══ QUESTION CARD ══ */}
          {question&&phase!=="idle"&&(
            <div style={{...card,
              border:`2px solid ${
                phase==="reading"?C.cyan:
                (phase==="buzzed"||phase==="listening")?C.gold:
                phase==="answered"?(result?.correct?(isPower?C.purple:C.green):C.red):C.border}`,
              transition:"border-color 0.3s"}}>

              {/* Tags + buzz button */}
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <span style={{background:C.blueL,color:C.blue,padding:"3px 10px",
                    borderRadius:20,fontSize:"0.68rem",fontFamily:"monospace",
                    textTransform:"uppercase",fontWeight:600}}>{question.category}</span>
                  {question.subcategory&&(
                    <span style={{background:C.cardAlt,color:C.textMid,padding:"3px 10px",
                      borderRadius:20,fontSize:"0.68rem",fontFamily:"monospace",textTransform:"uppercase"}}>
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

              {/* Word-by-word question text — future words hidden until spoken */}
              <div style={{
                background:C.cardAlt,border:`1.5px solid ${C.border}`,
                borderRadius:12,padding:"18px 20px",marginBottom:16,
                lineHeight:2.2,fontSize:"clamp(0.95rem,2.5vw,1.1rem)",
                minHeight:80,
              }}>
                {displayTokens.length===0 ? (
                  <span style={{color:C.textSoft,fontStyle:"italic",
                    fontFamily:"system-ui,sans-serif"}}>
                    Waiting for question…
                  </span>
                ) : litWordIdx===-1 ? (
                  /* TTS hasn't fired yet — blinking cursor */
                  <span style={{display:"inline-block",width:10,height:"1.1em",
                    background:C.cyan,borderRadius:2,verticalAlign:"middle",
                    animation:"blink 0.9s step-end infinite"}}/>
                ) : (
                  displayTokens.map((tok, i) => {
                    const allDone = litWordIdx === Infinity;

                    // ── Future words: completely hidden ──
                    if (!allDone && i > litWordIdx) return null;

                    // ── ⚡ BUZZ power marker ──
                    // Hidden until TTS reaches it; then stays as a permanent landmark
                    if (tok === "(*)") {
                      return (
                        <span key={i} className="w-star">
                          ★ BUZZ HERE
                        </span>
                      );
                    }

                    const isCurrent = !allDone && i === litWordIdx;
                    // Only the word that just appeared (current) gets a fade-in.
                    // Past words are already visible — no re-animation on re-render.
                    return (
                      <span key={i} className={isCurrent ? "w-current" : "w-past"}
                        style={isCurrent
                          ? {animation:"popIn 0.15s ease"}
                          : undefined}>
                        {tok}{" "}
                      </span>
                    );
                  })
                )}
              </div>

              {/* Text input */}
              {phase==="buzzed"&&mode==="text"&&(
                <div>
                  <label style={lbl}>Your Answer — typos OK, AI judges</label>
                  <div style={{display:"flex",gap:8}}>
                    <input ref={inputRef} value={textAns} autoFocus autoComplete="off"
                      onChange={e=>setTextAns(e.target.value)} onKeyDown={handleKey}
                      placeholder="Type answer, press Enter…"
                      style={{flex:1,padding:"13px 14px",background:"#fff",
                        border:`2px solid ${C.blue}`,borderRadius:10,
                        color:C.text,outline:"none",fontSize:"1rem"}}/>
                    <button onClick={()=>{submitAnswerRef.current(textAns);}}
                      disabled={!textAns.trim()}
                      style={{padding:"13px 18px",borderRadius:10,border:"none",
                        background:C.blue,color:"#fff",fontFamily:"system-ui,sans-serif",
                        fontWeight:"bold",cursor:textAns.trim()?"pointer":"not-allowed",
                        opacity:textAns.trim()?1:0.5,fontSize:"1rem",whiteSpace:"nowrap"}}>
                      Submit ↵
                    </button>
                  </div>
                  <p style={{fontSize:"0.72rem",color:C.textSoft,marginTop:5,fontFamily:"system-ui,sans-serif"}}>
                    Enter to submit · {countdown}s left · Typos handled by AI
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

              {/* Listening */}
              {phase==="listening"&&(
                <div style={{textAlign:"center",padding:"24px",background:C.purpleL,
                  borderRadius:12,border:`2px solid ${C.purple}`}}>
                  <div style={{fontSize:"3rem",marginBottom:8}}>🎤</div>
                  <div style={{color:C.purple,fontWeight:"bold",fontSize:"1.1rem",
                    fontFamily:"system-ui,sans-serif"}}>Listening…</div>
                  <div style={{color:C.textSoft,fontSize:"0.85rem",marginTop:4,
                    fontFamily:"system-ui,sans-serif"}}>Speak clearly — AI handles accents &amp; typos</div>
                </div>
              )}

              {/* Judging spinner */}
              {phase==="judging"&&(
                <div style={{textAlign:"center",padding:"24px",background:C.blueL,
                  borderRadius:12,border:`1.5px solid ${C.blue}30`}}>
                  <div style={{fontSize:"2.5rem",marginBottom:8}}>🤔</div>
                  <div style={{color:C.blue,fontWeight:"bold",fontSize:"1.05rem",
                    fontFamily:"system-ui,sans-serif"}}>Checking QB Reader + AI…</div>
                </div>
              )}

              {/* ── Result panel ── */}
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
                          background:C.purple,color:"#fff",padding:"3px 12px",borderRadius:20,
                          fontSize:"0.7rem",fontWeight:"bold",marginBottom:8,
                          textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"system-ui,sans-serif"}}>
                          ⚡ POWER — Early Buzz!
                        </div>
                      )}
                      <div style={{fontSize:"1.1rem",fontWeight:"bold",fontFamily:"system-ui,sans-serif",
                        color:result.correct?(isPower?C.purple:C.green):C.red}}>
                        {result.correct
                          ?(isPower?`✓ POWER Correct! +${result.points} pts`:`✓ Correct! +${result.points} pts`)
                          :"✗ Incorrect — 0 pts"}
                      </div>
                      <div style={{fontSize:"0.83rem",color:C.textMid,marginTop:4,fontFamily:"system-ui,sans-serif"}}>
                        {result.reason}
                      </div>
                      {(voiceAns||textAns)&&(
                        <div style={{fontSize:"0.78rem",color:C.textSoft,marginTop:3,fontFamily:"system-ui,sans-serif"}}>
                          You said: <em>&quot;{voiceAns||textAns}&quot;</em>
                        </div>
                      )}
                    </div>
                    <div style={{fontSize:"2.2rem"}}>{result.correct?(isPower?"⚡":"🏆"):"📖"}</div>
                  </div>

                  {/* Correct answer box */}
                  <div style={{background:C.goldL,border:`1.5px solid ${C.gold}50`,
                    borderRadius:12,padding:"14px 18px",marginBottom:16}}>
                    <div style={lbl}>Correct Answer</div>
                    <div style={{fontSize:"1.35rem",color:C.gold,fontWeight:"bold"}}>{question.answer}</div>
                    <div style={{fontSize:"0.75rem",color:C.textMid,marginTop:4,fontFamily:"system-ui,sans-serif"}}>
                      {question.category}{question.subcategory?` · ${question.subcategory}`:""} · {question.setName}
                    </div>
                  </div>

                  {/* ── Clue Hint Panel ── */}
                  <div style={{background:"#f0f4ff",border:`1.5px solid ${C.blue}30`,
                    borderRadius:14,padding:"16px 18px",marginBottom:16}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                      <span style={{fontSize:"1.1rem"}}>💡</span>
                      <span style={{fontSize:"0.6rem",fontWeight:"bold",letterSpacing:"0.15em",
                        textTransform:"uppercase",color:C.blue,fontFamily:"system-ui,sans-serif"}}>
                        Clue Connection — What you should have known
                      </span>
                    </div>
                    {hintLoading?(
                      <div style={{color:C.textSoft,fontSize:"0.88rem",fontStyle:"italic",
                        fontFamily:"system-ui,sans-serif"}}>
                        🤖 AI is analysing the clues…
                      </div>
                    ):hint?(
                      <div style={{fontSize:"0.93rem",color:C.text,lineHeight:1.75,
                        fontFamily:"Georgia,'Times New Roman',serif"}}>
                        {hint}
                      </div>
                    ):(
                      <div style={{color:C.textSoft,fontSize:"0.85rem",fontStyle:"italic",
                        fontFamily:"system-ui,sans-serif"}}>
                        Hint unavailable — check ANTHROPIC_API_KEY in Vercel settings.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Skip reading */}
              {phase==="reading"&&(
                <div style={{textAlign:"center",marginTop:10}}>
                  <button onClick={()=>{
                    window.speechSynthesis?.cancel(); powerPassedRef.current=true;
                    setLitWordIdx(Infinity); setPhase("buzzed"); startTimer(10);
                    setTimeout(()=>inputRef.current?.focus(),100);
                  }} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,
                    padding:"7px 16px",color:C.textSoft,fontSize:"0.8rem",
                    fontFamily:"system-ui,sans-serif",cursor:"pointer"}}>
                    Skip reading → Answer now (no power, 10s timer)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ══ IDLE STATE ══ */}
          {phase==="idle"&&(
            <div style={{textAlign:"center",padding:"40px 20px"}}>
              <div style={{fontSize:"4rem",marginBottom:12}}>🎓</div>
              <div style={{fontSize:"1.1rem",fontWeight:"bold",color:C.textMid,
                marginBottom:6,fontFamily:"system-ui,sans-serif"}}>
                Real NAQT Questions from QB Reader
              </div>
              <div style={{fontSize:"0.88rem",color:C.textSoft,fontFamily:"system-ui,sans-serif",lineHeight:1.7}}>
                Pick category + sub-area · tap ⚡ Generate<br/>
                Buzz before ★ for Power (15 pts) · after ★ for 10 pts<br/>
                Typos OK — AI judges your answer
              </div>
            </div>
          )}

          {/* ══ SCORE SUMMARY ══ */}
          {qCount>0&&(
            <div style={{...card,padding:"16px"}}>
              <div style={{display:"flex",flexWrap:"wrap"}}>
                {[
                  {label:"Points",    val:score,      color:C.gold  },
                  {label:"Correct",   val:correct,    color:C.green },
                  {label:"⚡ Powers", val:powers,     color:C.purple},
                  {label:"Questions", val:qCount,     color:C.blue  },
                  {label:"Accuracy",  val:`${acc}%`,  color:acc>=70?C.green:acc>=40?C.gold:C.red},
                ].map(({label,val,color})=>(
                  <div key={label} style={{flex:"1 1 72px",textAlign:"center",
                    padding:"10px 6px",borderRight:`1px solid ${C.border}`}}>
                    <div style={{fontSize:"1.7rem",fontWeight:"bold",color}}>{val}</div>
                    <div style={{fontSize:"0.6rem",color:C.textSoft,textTransform:"uppercase",
                      letterSpacing:"0.1em",fontFamily:"system-ui,sans-serif"}}>{label}</div>
                  </div>
                ))}
                <div style={{display:"flex",alignItems:"center",padding:"0 12px"}}>
                  <button onClick={()=>{setScore(0);setQCount(0);setCorrect(0);setPowers(0);}}                    style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,
                      padding:"6px 12px",color:C.textSoft,fontSize:"0.78rem",
                      fontFamily:"system-ui,sans-serif",cursor:"pointer"}}>Reset</button>
                </div>
              </div>
            </div>
          )}

          {/* ══ HOW TO USE ══ */}
          <div style={{...card,background:C.cardAlt}}>
            <div style={lbl}>How to Use</div>
            <div className="howto-row">
              {[
                {icon:"📚",n:"1",title:"Pick & Sub-Area", desc:"Choose category + sub-area"},
                {icon:"🎙",n:"2",title:"Listen",          desc:"Words highlight as reader speaks"},
                {icon:"⚡",n:"3",title:"Power Buzz",      desc:"Before ★ = 15 pts · 10s timer"},
                {icon:"🔔",n:"4",title:"Normal Buzz",     desc:"After ★ = 10 pts · 10s timer"},
                {icon:"🤖",n:"5",title:"AI Judge",        desc:"Typos & accents handled by AI"},
              ].map(({icon,n,title,desc})=>(
                <div key={n} style={{textAlign:"center",padding:"10px 6px",
                  background:"#fff",borderRadius:12,border:`1.5px solid ${C.border}`}}>
                  <div style={{fontSize:"1.5rem",marginBottom:3}}>{icon}</div>
                  <div style={{fontSize:"0.58rem",color:C.blue,fontWeight:"bold",fontFamily:"system-ui,sans-serif"}}>Step {n}</div>
                  <div style={{fontSize:"0.74rem",color:C.text,fontWeight:"bold",fontFamily:"system-ui,sans-serif",marginBottom:2}}>{title}</div>
                  <div style={{fontSize:"0.66rem",color:C.textMid,lineHeight:1.4,fontFamily:"system-ui,sans-serif"}}>{desc}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
