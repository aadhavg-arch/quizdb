"use client";
// app/login/page.tsx
import React, { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const C = {
  bg:"#eef0fb", card:"#ffffff", border:"#dde1f5",
  blue:"#3b5bdb", blueL:"#edf2ff",
  purple:"#6741d9",
  red:"#c92a2a", redL:"#fff5f5",
  green:"#2f9e44", greenL:"#ebfbee",
  text:"#1a1b2e", textSoft:"#868e96",
  shadow:"0 4px 28px rgba(59,91,219,0.14)",
};

// Inner form — needs useSearchParams (must be inside Suspense)
function LoginForm() {
  const searchParams = useSearchParams();
  const nextPath     = searchParams.get("next") ?? "/";

  const [userId,   setUserId]   = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const passRef = useRef<HTMLInputElement>(null);

  // If already logged in, go straight home
  useEffect(() => {
    fetch("/api/auth/check").then(r => { if (r.ok) window.location.href = nextPath; }).catch(()=>{});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async () => {
    if (!userId.trim()) { setError("Please enter your User ID."); return; }
    if (!password.trim()) { setError("Please enter your Password."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userId.trim(), password: password.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        window.location.href = nextPath;
      } else {
        setError(data.error ?? "Login failed. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e: React.KeyboardEvent, next?: ()=>void) => {
    if (e.key === "Enter") next ? next() : handleLogin();
  };

  const inp: React.CSSProperties = {
    width:"100%", padding:"13px 14px 13px 44px",
    border:`1.5px solid ${C.border}`, borderRadius:11,
    background:"#f8f9ff", color:C.text, outline:"none",
    fontSize:"16px", fontFamily:"system-ui,sans-serif",
    transition:"border-color 0.15s, box-shadow 0.15s",
  };

  return (
    <div style={{padding:"28px 28px 32px"}}>

      {/* Welcome */}
      <div style={{textAlign:"center", marginBottom:26}}>
        <div style={{fontSize:"1.02rem", fontWeight:"bold", color:C.text, marginBottom:4,
          fontFamily:"system-ui,sans-serif"}}>
          Sign in to continue
        </div>
        <div style={{fontSize:"0.8rem", color:C.textSoft, fontFamily:"system-ui,sans-serif"}}>
          Enter your credentials provided by your teacher
        </div>
      </div>

      {/* User ID */}
      <div style={{marginBottom:16}}>
        <label style={{display:"block", fontSize:"0.62rem", fontWeight:"700",
          letterSpacing:"0.15em", textTransform:"uppercase",
          color:C.textSoft, marginBottom:6, fontFamily:"system-ui,sans-serif"}}>
          User ID
        </label>
        <div style={{position:"relative"}}>
          <span style={{position:"absolute", left:13, top:"50%",
            transform:"translateY(-50%)", fontSize:"1.05rem", pointerEvents:"none",
            userSelect:"none"}}>👤</span>
          <input
            style={inp}
            type="text"
            value={userId}
            autoComplete="username"
            autoFocus
            spellCheck={false}
            placeholder="Enter your user ID"
            onChange={e=>{ setUserId(e.target.value); setError(""); }}
            onKeyDown={e=>onKey(e, ()=>passRef.current?.focus())}
          />
        </div>
      </div>

      {/* Password */}
      <div style={{marginBottom:22}}>
        <label style={{display:"block", fontSize:"0.62rem", fontWeight:"700",
          letterSpacing:"0.15em", textTransform:"uppercase",
          color:C.textSoft, marginBottom:6, fontFamily:"system-ui,sans-serif"}}>
          Password
        </label>
        <div style={{position:"relative"}}>
          <span style={{position:"absolute", left:13, top:"50%",
            transform:"translateY(-50%)", fontSize:"1.05rem", pointerEvents:"none",
            userSelect:"none"}}>🔑</span>
          <input
            style={{...inp, paddingRight:46}}
            ref={passRef}
            type={showPass ? "text" : "password"}
            value={password}
            autoComplete="current-password"
            placeholder="Enter your password"
            onChange={e=>{ setPassword(e.target.value); setError(""); }}
            onKeyDown={e=>onKey(e)}
          />
          <button
            tabIndex={-1}
            onClick={()=>setShowPass(p=>!p)}
            aria-label={showPass ? "Hide password" : "Show password"}
            style={{position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
              background:"none", border:"none", cursor:"pointer",
              fontSize:"1.05rem", padding:2, color:C.textSoft, lineHeight:1}}>
            {showPass ? "🙈" : "👁️"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{marginBottom:16, padding:"11px 14px",
          background:C.redL, border:`1.5px solid ${C.red}40`,
          borderRadius:9, color:C.red, fontSize:"0.85rem",
          lineHeight:1.5, display:"flex", alignItems:"center", gap:8,
          fontFamily:"system-ui,sans-serif"}}>
          <span>⚠️</span>{error}
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleLogin}
        disabled={loading}
        style={{
          width:"100%", padding:"14px", borderRadius:12, border:"none",
          background: loading ? "#dee2e6" : "linear-gradient(135deg,#3b5bdb,#6741d9)",
          color: loading ? "#868e96" : "#fff",
          fontSize:"1rem", fontWeight:"bold", letterSpacing:"0.01em",
          fontFamily:"system-ui,sans-serif",
          cursor: loading ? "not-allowed" : "pointer",
          boxShadow: loading ? "none" : "0 4px 16px rgba(59,91,219,0.28)",
          transition:"all 0.2s",
        }}>
        {loading ? "🔐 Signing in…" : "🚀 Sign In"}
      </button>

      <div style={{textAlign:"center", marginTop:18,
        fontSize:"0.72rem", color:C.textSoft, lineHeight:1.6,
        fontFamily:"system-ui,sans-serif"}}>
        🔒 Contact your teacher or administrator for login credentials
      </div>
    </div>
  );
}

// Page wrapper — Suspense required because useSearchParams needs it
export default function LoginPage() {
  return (
    <>
      <style>{`
        *{box-sizing:border-box;}
        body{margin:0;-webkit-tap-highlight-color:transparent;}
        input,button{font-size:16px;-webkit-appearance:none;}
        input:focus{border-color:#3b5bdb!important;box-shadow:0 0 0 3px #3b5bdb22!important;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        .card{animation:fadeUp 0.35s ease;}
        @media(hover:hover){.sbtn:hover:not(:disabled){filter:brightness(1.07);transform:translateY(-1px);}}
        .sbtn:active{opacity:0.85;}
      `}</style>

      <div style={{minHeight:"100vh", background:C.bg,
        display:"flex", alignItems:"center", justifyContent:"center",
        padding:"24px 16px"}}>

        <div className="card" style={{width:"100%", maxWidth:430,
          background:C.card, borderRadius:22,
          border:`1.5px solid ${C.border}`, boxShadow:C.shadow,
          overflow:"hidden"}}>

          {/* Banner */}
          <div style={{background:"linear-gradient(135deg,#3b5bdb,#6741d9)",
            padding:"32px 28px 26px", textAlign:"center"}}>
            <div style={{fontSize:"3rem", marginBottom:10}}>🏆</div>
            <div style={{color:"#fff", fontWeight:"bold", fontSize:"1.4rem",
              fontFamily:"Georgia,'Times New Roman',serif", letterSpacing:"-0.01em"}}>
              NAQT Quiz Bowl Trainer
            </div>
            <div style={{color:"rgba(255,255,255,0.72)", fontSize:"0.68rem",
              letterSpacing:"0.2em", textTransform:"uppercase", marginTop:6,
              fontFamily:"system-ui,sans-serif"}}>
              Middle School Edition
            </div>
          </div>

          {/* Form wrapped in Suspense for useSearchParams */}
          <Suspense fallback={
            <div style={{padding:40, textAlign:"center", color:C.textSoft,
              fontFamily:"system-ui,sans-serif", fontSize:"0.9rem"}}>
              Loading…
            </div>
          }>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </>
  );
}
