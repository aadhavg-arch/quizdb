"use client";
// app/login/page.tsx
import React, { useState, useRef } from "react";

const C = {
  bg:"#eef0fb", card:"#ffffff", border:"#dde1f5",
  blue:"#3b5bdb", blueL:"#edf2ff",
  purple:"#6741d9", purpleL:"#f3f0ff",
  red:"#c92a2a", redL:"#fff5f5",
  text:"#1a1b2e", textSoft:"#868e96",
  shadow:"0 4px 24px rgba(59,91,219,0.13)",
};

export default function LoginPage() {
  const [userId,   setUserId]   = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const passRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    if (!userId.trim() || !password.trim()) {
      setError("Please enter both User ID and Password."); return;
    }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userId.trim(), password: password.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        window.location.href = "/";
      } else {
        setError(data.error ?? "Login failed. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <>
      <style>{`
        *{box-sizing:border-box;}
        body{margin:0;font-family:system-ui,sans-serif;-webkit-tap-highlight-color:transparent;}
        input{font-size:16px;font-family:inherit;-webkit-appearance:none;}
        button{font-size:16px;font-family:inherit;-webkit-appearance:none;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .login-card{animation:fadeIn 0.35s ease}
        @media(hover:hover){.login-btn:hover:not(:disabled){filter:brightness(1.08);transform:translateY(-1px);}}
        .login-btn:active{opacity:0.85;}
        .inp:focus{border-color:${C.blue}!important;box-shadow:0 0 0 3px ${C.blue}22!important;}
      `}</style>

      <div style={{
        minHeight:"100vh", background:C.bg,
        display:"flex", alignItems:"center", justifyContent:"center",
        padding:"24px 16px",
      }}>
        <div className="login-card" style={{
          width:"100%", maxWidth:420,
          background:C.card, borderRadius:22,
          border:`1.5px solid ${C.border}`,
          boxShadow:C.shadow, overflow:"hidden",
        }}>

          {/* Header banner */}
          <div style={{
            background:"linear-gradient(135deg,#3b5bdb,#6741d9)",
            padding:"32px 28px 28px", textAlign:"center",
          }}>
            <div style={{fontSize:"3.2rem", marginBottom:10}}>🏆</div>
            <div style={{color:"#fff", fontWeight:"bold", fontSize:"1.35rem",
              letterSpacing:"-0.01em", fontFamily:"Georgia,serif"}}>
              NAQT Quiz Bowl Trainer
            </div>
            <div style={{color:"rgba(255,255,255,0.7)", fontSize:"0.72rem",
              letterSpacing:"0.18em", textTransform:"uppercase", marginTop:5}}>
              Middle School Edition
            </div>
          </div>

          {/* Form */}
          <div style={{padding:"28px 28px 32px"}}>
            <div style={{textAlign:"center", marginBottom:24}}>
              <div style={{fontSize:"1rem", fontWeight:"bold", color:C.text, marginBottom:4}}>
                Sign in to continue
              </div>
              <div style={{fontSize:"0.8rem", color:C.textSoft}}>
                Enter your credentials to access the app
              </div>
            </div>

            {/* User ID */}
            <div style={{marginBottom:16}}>
              <label style={{display:"block", fontSize:"0.65rem", fontWeight:"bold",
                letterSpacing:"0.14em", textTransform:"uppercase",
                color:C.textSoft, marginBottom:6}}>
                User ID
              </label>
              <div style={{position:"relative"}}>
                <span style={{position:"absolute", left:13, top:"50%",
                  transform:"translateY(-50%)", fontSize:"1.1rem", pointerEvents:"none"}}>
                  👤
                </span>
                <input
                  className="inp"
                  type="text"
                  value={userId}
                  autoComplete="username"
                  autoFocus
                  onChange={e => { setUserId(e.target.value); setError(""); }}
                  onKeyDown={e => { if(e.key==="Enter") passRef.current?.focus(); }}
                  placeholder="Enter your user ID"
                  style={{
                    width:"100%", padding:"13px 14px 13px 40px",
                    border:`1.5px solid ${C.border}`, borderRadius:11,
                    background:"#f8f9ff", color:C.text, outline:"none",
                    transition:"border-color 0.15s, box-shadow 0.15s",
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{marginBottom:22}}>
              <label style={{display:"block", fontSize:"0.65rem", fontWeight:"bold",
                letterSpacing:"0.14em", textTransform:"uppercase",
                color:C.textSoft, marginBottom:6}}>
                Password
              </label>
              <div style={{position:"relative"}}>
                <span style={{position:"absolute", left:13, top:"50%",
                  transform:"translateY(-50%)", fontSize:"1.1rem", pointerEvents:"none"}}>
                  🔑
                </span>
                <input
                  className="inp"
                  ref={passRef}
                  type={showPass ? "text" : "password"}
                  value={password}
                  autoComplete="current-password"
                  onChange={e => { setPassword(e.target.value); setError(""); }}
                  onKeyDown={handleKey}
                  placeholder="Enter your password"
                  style={{
                    width:"100%", padding:"13px 44px 13px 40px",
                    border:`1.5px solid ${C.border}`, borderRadius:11,
                    background:"#f8f9ff", color:C.text, outline:"none",
                    transition:"border-color 0.15s, box-shadow 0.15s",
                  }}
                />
                {/* Show/hide toggle */}
                <button
                  onClick={() => setShowPass(p => !p)}
                  style={{
                    position:"absolute", right:12, top:"50%",
                    transform:"translateY(-50%)",
                    background:"none", border:"none", cursor:"pointer",
                    fontSize:"1rem", padding:"2px", lineHeight:1,
                    color:C.textSoft,
                  }}
                  tabIndex={-1}
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                marginBottom:16, padding:"11px 14px",
                background:C.redL, border:`1.5px solid ${C.red}40`,
                borderRadius:9, color:C.red,
                fontSize:"0.84rem", lineHeight:1.5,
                display:"flex", alignItems:"center", gap:8,
              }}>
                <span style={{fontSize:"1rem"}}>⚠️</span>
                {error}
              </div>
            )}

            {/* Submit button */}
            <button
              className="login-btn"
              onClick={handleSubmit}
              disabled={loading}
              style={{
                width:"100%", padding:"14px",
                borderRadius:12, border:"none",
                background: loading
                  ? "#dee2e6"
                  : "linear-gradient(135deg,#3b5bdb,#6741d9)",
                color: loading ? "#868e96" : "#fff",
                fontSize:"1rem", fontWeight:"bold",
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: loading ? "none" : "0 4px 16px rgba(59,91,219,0.3)",
                transition:"all 0.2s",
                letterSpacing:"0.01em",
              }}
            >
              {loading ? "🔐 Signing in…" : "🚀 Sign In"}
            </button>

            <div style={{textAlign:"center", marginTop:18,
              fontSize:"0.72rem", color:C.textSoft, lineHeight:1.6}}>
              🔒 Contact your administrator for access credentials
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
