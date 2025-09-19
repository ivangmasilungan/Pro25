// src/App.jsx
import React, { useEffect, useRef, useState, useCallback } from "react";
import { supabase as SB } from "./lib/supabase";

/* ─────────────────────────── utilities & constants ─────────────────────────── */
function setCookie(n,v,d=365){document.cookie=`${n}=${encodeURIComponent(v)}; Expires=${new Date(Date.now()+d*864e5).toUTCString()}; Path=/; SameSite=Lax`;}
function getCookie(n){const m=document.cookie.match(new RegExp("(^| )"+n+"=([^;]+)"));return m?decodeURIComponent(m[2]):null}
function delCookie(n){document.cookie=`${n}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`}

function useAuthUser(){
  const [user,setUser]=useState(()=>getCookie("auth_user")||localStorage.getItem("auth_user")||null);
  const login  =(name)=>{localStorage.setItem("auth_user",name); setCookie("auth_user",name); setUser(name);};
  const logout =()=>{localStorage.removeItem("auth_user"); delCookie("auth_user"); setUser(null);};
  useEffect(()=>{const onStorage=e=>{if(e.key==="auth_user") setUser(e.newValue)}; window.addEventListener("storage",onStorage); return()=>window.removeEventListener("storage",onStorage)},[]);
  return {user,login,logout};
}

const TEAMS=["A","B","C","D","E","F","G","H","I","J"];
const emptyTeams=TEAMS.reduce((a,t)=>{a[t]=[];return a;},{});
const LS_KEY="paml:v17-positionC-visible-captain-token";
const loadLocal=()=>{try{const s=localStorage.getItem(LS_KEY);return s?JSON.parse(s):null;}catch{return null}}
const saveLocal=(s)=>{try{localStorage.setItem(LS_KEY,JSON.stringify(s));}catch{}}
const nextScore=(prev,type,delta)=>({ ...prev, [type]: Math.max(0, Number(prev?.[type]??0)+Number(delta||0)) });
function normTeam(v){ const x=(v??"").trim(); return x?x:null; }

/* ───────────────────────── Outcome helpers ───────────────────────── */
function getOutcome(game){
  const ta=game?.team_a||""; const tb=game?.team_b||"";
  const a = Number(game?.score_a ?? 0);
  const b = Number(game?.score_b ?? 0);
  if(!ta || !tb) return {type:"invalid"};
  if(a===b)      return {type:"tie", a:ta, b:tb};
  if(a>b)        return {type:"decided", winner:ta, loser:tb};
  return {type:"decided", winner:tb, loser:ta};
}
function winnerLabel(g){
  const oc=getOutcome(g);
  if(oc.type==="decided") return `Team ${oc.winner}`;
  if(oc.type==="tie") return "Tie";
  return "TBD";
}

/* ─────────────── Name parsing / composing / rendering ───────────────
   IMPORTANT CHANGE:
   - Captain marker is **CAPTAIN** (or CAP) in storage.
   - Position "C" is treated as a normal position (shows as "C").
   - This fixes the bug where picking position C did not appear.
*/
const POS_RE = /^(PG|SG|SF|PF|C)$/i;
const CAP_RE = /^(CAPTAIN|CAP)$/i;

function parseStoredName(raw){
  const s=String(raw||"");
  const m=s.match(/^(.*?)(\s*\((.*)\))\s*$/);
  const baseWithJersey = (m? m[1] : s).trim(); // e.g., "Marvin C #20"
  const insideRaw = m? (m[3]||"") : "";        // e.g., "PG, CAPTAIN"

  const tokens = insideRaw.split(",").map(t=>t.trim()).filter(Boolean);

  let isCaptain = false;
  const otherTags = [];
  const seen = new Set();

  for (const t of tokens) {
    if (CAP_RE.test(t)) { isCaptain = true; continue; }        // 'CAPTAIN' or 'CAP'
    if (POS_RE.test(t)) {                                      // positions (including 'C')
      const up = t.toUpperCase();
      if (!seen.has(up)) { seen.add(up); otherTags.push(up); }
      continue;
    }
    // keep any extra custom tags (dedup)
    const key=t.toUpperCase();
    if (!seen.has(key)) { seen.add(key); otherTags.push(t); }
  }
  return { baseWithJersey, isCaptain, otherTags };
}

function composeStoredName(baseWithJersey, isCaptain, otherTags){
  const tags = [];
  // normalize / dedupe positions in uppercase
  const seen=new Set();
  (otherTags||[]).forEach(t=>{
    const up=String(t||"").toUpperCase().trim();
    if (!up) return;
    if (!seen.has(up)) { seen.add(up); tags.push(up); }
  });
  if (isCaptain) tags.push("CAPTAIN"); // << store CAPTAIN (not C)
  const paren = tags.length ? ` (${tags.join(", ")})` : "";
  return `${baseWithJersey}${paren}`;
}

/* Visible renderer: prints tags except captain separately,
   and appends red "Captain" if captain=true. */
function NameWithCaptain({ name, className = "" }) {
  const { baseWithJersey, isCaptain, otherTags } = parseStoredName(name);
  const inside = [];
  otherTags.forEach((p, i) => {
    inside.push(<span key={`tag-${i}`}>{p}</span>);
    if (i < otherTags.length - 1 || isCaptain) inside.push(", ");
  });
  if (isCaptain) inside.push(<span key="cap" className="text-red-700 font-semibold">Captain</span>);
  return (
    <span className={className}>
      {baseWithJersey}{inside.length ? <> ({inside})</> : null}
    </span>
  );
}

/* ───────────────────────────── credentials ───────────────────────────── */
let storedUsername=import.meta.env?.VITE_APP_USERNAME || "Admin";
let storedPassword=import.meta.env?.VITE_APP_PASSWORD || "2025!";

/* ─────────────────────────── Supabase helpers ─────────────────────────── */
async function sbFetchAll(){
  const [
    {data:players, error:ep},
    {data:scores,  error:es},
    {data:games,   error:eg},
  ] = await Promise.all([
    SB.from("players").select("full_name,team,paid,payment_method").order("full_name",{ascending:true}),
    SB.from("team_scores").select("team,wins,losses"),
    SB.from("games").select("id,title,team_a,team_b,gdate,gtime,location,score_a,score_b").order("title",{ascending:true}),
  ]);
  if (ep||es||eg) throw (ep||es||eg);
  return {players:players||[], scores:scores||[], games:games||[]};
}
async function sbUpsertPlayer(row){
  const payload = { ...row, team: normTeam(row.team) };
  const {error}=await SB.from("players").upsert(payload);
  if(error) throw error;
}
async function sbDeletePlayer(name){ const {error}=await SB.from("players").delete().eq("full_name",name); if(error) throw error; }
async function sbDeleteAllPlayers(){ const {error}=await SB.from("players").delete().neq("full_name",""); if(error) throw error; }
async function sbUpsertScore(team,wins,losses){ const {error}=await SB.from("team_scores").upsert({team,wins,losses},{onConflict:"team"}); if(error) throw error; }
async function sbInsertGame(row){
  const payload = { ...row, team_a: normTeam(row.team_a), team_b: normTeam(row.team_b) };
  const {data,error}=await SB.from("games").insert(payload).select().single(); if(error) throw error; return data;
}
async function sbUpdateGame(id,row){
  const payload = { ...row, team_a: normTeam(row.team_a), team_b: normTeam(row.team_b) };
  const {error}=await SB.from("games").update(payload).eq("id",id); if(error) throw error;
}
async function sbDeleteGame(id){ const {error}=await SB.from("games").delete().eq("id",id); if(error) throw error; }
async function sbBulkUpsert(local){
  const playerRows=(local.individuals||[]).map(n=>({
    full_name:n,
    team:normTeam(Object.keys(local.teams||{}).find(t=>(local.teams[t]||[]).includes(n))||null),
    paid:!!(local.paid && local.paid[n]),
    payment_method:(local.paid && local.paid[n]) || null
  }));
  const scoreRows=TEAMS.map(t=>({team:t,wins:local.scores?.[t]?.win||0,losses:local.scores?.[t]?.lose||0}));
  const r1=await SB.from("players").upsert(playerRows,{onConflict:"full_name"});
  const r2=await SB.from("team_scores").upsert(scoreRows,{onConflict:"team"});
  if (r1.error||r2.error) throw (r1.error||r2.error);
}

/* ─────────────────────────────── Login ─────────────────────────────── */
function Login({ onLogin }){
  const [u,setU]=useState(""); 
  const [p,setP]=useState("");
  const [hideLogo,setHideLogo]=useState(false);
  const logoUrl = import.meta.env?.VITE_LOGO_URL || "/sports_logo.jpg";
  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md text-center">
        {!hideLogo ? (
          <img src={logoUrl} alt="Logo" className="w-28 h-28 mx-auto mb-6 object-contain" onError={()=>setHideLogo(true)} />
        ) : (
          <div className="w-28 h-28 mx-auto mb-6 rounded-full bg-gray-100 grid place-items-center text-xs text-gray-500">No Logo</div>
        )}
        <h1 className="text-2xl font-bold mb-6">Login</h1>
        <form onSubmit={(e)=>{e.preventDefault(); if(u===storedUsername && p===storedPassword) onLogin(u); else alert("Invalid");}} className="space-y-3">
          <input className="w-full border rounded-xl px-3 py-2" placeholder="Username" value={u} onChange={e=>setU(e.target.value)} />
          <input className="w-full border rounded-xl px-3 py-2" type="password" placeholder="Password" value={p} onChange={e=>setP(e.target.value)} />
          <button className="w-full h-10 rounded-xl bg-blue-600 text-white">Login</button>
        </form>
      </div>
    </div>
  );
}

/* ───────────────────────────── League (Admin) ───────────────────────────── */
function League({ onLogout }){
  const [individuals,setIndividuals]=useState([]);
  const [teams,setTeams]=useState(emptyTeams);
  const [paid,setPaid]=useState({}); // name -> "cash" | "gcash"
  const [scores,setScores]=useState(TEAMS.reduce((a,t)=>{a[t]={win:0,lose:0};return a;},{}));

  const [newName,setNewName]=useState("");
  const [newJersey,setNewJersey]=useState("");
  const [newPos,setNewPos]=useState("");
  const [newCaptain,setNewCaptain]=useState(false);

  const [conn,setConn]=useState("checking"); // online | local | checking
  const [connErr,setConnErr]=useState("");

  // Edit dialog state
  const [editTarget,setEditTarget]=useState(null); // old stored full
  const [editBaseName,setEditBaseName]=useState("");
  const [editJersey,setEditJersey]=useState("");
  const [editPos,setEditPos]=useState("");
  const [editCaptain,setEditCaptain]=useState(false);
  const [showEditModal,setShowEditModal]=useState(false);

  const [flashName,setFlashName]=useState(null);
  const itemRefs=useRef({});

  const [payFor,setPayFor]=useState(null);
  const [showPayModal,setShowPayModal]=useState(false);

  const [showClearModal,setShowClearModal]=useState(false);
  const [showLogoutModal,setShowLogoutModal]=useState(false);
  const [showDeleteModal,setShowDeleteModal]=useState(false);
  const [deleteTarget,setDeleteTarget]=useState(null);

  const [games,setGames]=useState([]);
  const [gTitle,setGTitle]=useState(""); const [gDate,setGDate]=useState(""); const [gTime,setGTime]=useState(""); const [gLoc,setGLoc]=useState("");
  const [gTeamA,setGTeamA]=useState(""); const [gTeamB,setGTeamB]=useState("");
  const [editLocal,setEditLocal]=useState(null); const [showGameEditModal,setShowGameEditModal]=useState(false);

  const makeLocal = (extra={}) => ({ individuals,teams,paid,scores,games, ...extra });

  const applyRemote = (remote)=>{
    const {players, scores:ts, games:gs}=remote||{players:[],scores:[],games:[]};
    setIndividuals(players.map(p=>p.full_name));
    const t=TEAMS.reduce((a,k)=>{a[k]=[];return a;},{});
    players.forEach(p=>{ if(p.team && t[p.team]) t[p.team].push(p.full_name); });
    setTeams(t);
    setPaid(players.reduce((a,p)=>{ a[p.full_name]=p.payment_method || (p.paid ? "cash" : undefined); return a; },{}));
    const s=TEAMS.reduce((a,k)=>{a[k]={win:0,lose:0};return a;},{});
    (ts||[]).forEach(r=>{ if(s[r.team]) s[r.team]={win:r.wins||0,lose:r.losses||0}; });
    setScores(s);
    setGames((gs||[]).map(g=>({
      id: g.id,
      title: g.title || "",
      team_a: g.team_a || "",
      team_b: g.team_b || "",
      gdate: g.gdate || "",
      gtime: g.gtime || "",
      location: g.location || "",
      score_a: Number.isFinite(g.score_a) ? g.score_a : 0,
      score_b: Number.isFinite(g.score_b) ? g.score_b : 0
    })));
    saveLocal({
      individuals: players.map(p=>p.full_name),
      teams: t,
      paid: players.reduce((a,p)=>{ a[p.full_name]=p.payment_method || (p.paid ? "cash" : undefined); return a; },{}),
      scores: s,
      games: (gs||[]).map(g=>({
        id: g.id,
        title: g.title || "",
        team_a: g.team_a || "",
        team_b: g.team_b || "",
        gdate: g.gdate || "",
        gtime: g.gtime || "",
        location: g.location || "",
        score_a: Number.isFinite(g.score_a) ? g.score_a : 0,
        score_b: Number.isFinite(g.score_b) ? g.score_b : 0
      }))
    });
  };
  const applyLocal=(snap)=>{ 
    setIndividuals(snap.individuals||[]); 
    setTeams(snap.teams||emptyTeams); 
    setPaid(snap.paid||{}); 
    setScores(snap.scores||TEAMS.reduce((a,t)=>{a[t]={win:0,lose:0};return a;},{})); 
    setGames((snap.games||[]).map(g=>({
      id: g.id,
      title: g.title || "",
      team_a: g.team_a || "",
      team_b: g.team_b || "",
      gdate: g.gdate || "",
      gtime: g.gtime || "",
      location: g.location || "",
      score_a: Number.isFinite(g.score_a) ? g.score_a : 0,
      score_b: Number.isFinite(g.score_b) ? g.score_b : 0
    })));
  };

  useEffect(()=>{ (async()=>{
    const localSnap=loadLocal();
    if (window.sb){
      try{
        const {error}=await window.sb.from("players").select("full_name").limit(1);
        if(error) throw error;
        setConn("online"); setConnErr("");
        const remote=await sbFetchAll();
        if ((remote.players||[]).length===0 && localSnap && (localSnap.individuals||[]).length>0){
          await sbBulkUpsert(localSnap);
          applyRemote(await sbFetchAll());
        } else applyRemote(remote);
        return;
      }catch(e){ setConn("local"); setConnErr(String(e?.message||e)); }
    }else{ setConn("local"); setConnErr("Supabase client not initialized."); }
    if(localSnap) applyLocal(localSnap);
  })(); },[]);

  useEffect(()=>{ if(!SB) return; const ch=SB.channel("league-sync")
    .on("postgres_changes",{event:"*",schema:"public",table:"players"},()=>refetch())
    .on("postgres_changes",{event:"*",schema:"public",table:"team_scores"},()=>refetch())
    .on("postgres_changes",{event:"*",schema:"public",table:"games"},()=>refetch())
    .subscribe();
    async function refetch(){ try{ applyRemote(await sbFetchAll()); }catch{} }
    return ()=>{ try{SB.removeChannel(ch);}catch{} };
  },[]);

  useEffect(()=>{ saveLocal(makeLocal()); },[individuals,teams,paid,scores,games]);

  /* compose for Add */
  function composeBaseWithJersey(name, jersey){
    const base = (name||"").trim();
    const j = (jersey||"").trim();
    return j ? `${base} #${j}` : base;
  }
  const add = async(e)=>{ 
    e.preventDefault();
    const base = (newName||"").trim();
    if(!base) return;
    const baseWithJersey = composeBaseWithJersey(base, newJersey||"");
    const tags = [];
    if (newPos.trim()) tags.push(newPos.trim().toUpperCase()); // may be "C" position
    const stored = composeStoredName(baseWithJersey, newCaptain, tags);

    setIndividuals(prev=>prev.concat(stored));
    setNewName(""); setNewJersey(""); setNewPos(""); setNewCaptain(false);

    if(SB){ 
      try{ await sbUpsertPlayer({full_name: stored, team: null, paid: false, payment_method: null}); }
      catch(e){ setConn("local"); setConnErr(String(e?.message||e)); }
    }
    setFlashName(stored);
    setTimeout(()=>{itemRefs.current[stored]?.scrollIntoView?.({behavior:"smooth",block:"center"});},50);
    setTimeout(()=>setFlashName(null),1500);
  };

  /* assign team */
  const assign = async(name,team)=>{ 
    setTeams(prev=>{const c=Object.fromEntries(Object.entries(prev).map(([k,a])=>[k,a.filter(m=>m!==name)])); if(team) c[team]=[...(c[team]||[]),name]; return c;});
    if(SB) try{ await sbUpsertPlayer({full_name:name,team,paid:!!paid[name],payment_method:paid[name]||null}); }catch(e){ setConn("local"); setConnErr(String(e?.message||e)); } 
  };

  /* open Edit dialog (structured) */
  const openEdit = (storedName) => {
    setEditTarget(storedName);
    const { baseWithJersey, isCaptain, otherTags } = parseStoredName(storedName);

    // split baseWithJersey into "Name" + optional " #NN"
    const m = baseWithJersey.match(/^(.*?)(?:\s*#(\d+))?$/);
    setEditBaseName((m?.[1]||"").trim());
    setEditJersey((m?.[2]||"").trim());

    // pick a position tag from otherTags if present (PG/SG/SF/PF/C)
    const pos = (otherTags.find(t=>POS_RE.test(t))||"").toUpperCase();
    setEditPos(pos);
    setEditCaptain(!!isCaptain);

    setShowEditModal(true);
  };

  const saveEdit = async () => {
    const oldStored = editTarget;
    if (!oldStored) { setShowEditModal(false); return; }

    const baseWithJersey = composeBaseWithJersey(editBaseName||"", editJersey||"");
    const otherTags = [];
    if (editPos) otherTags.push(editPos); // includes "C" position properly
    const newStored = composeStoredName(baseWithJersey, editCaptain, otherTags);

    // update local
    setIndividuals(prev=>prev.map(n=>n===oldStored?newStored:n));
    setTeams(prev=>{
      const c={};
      for(const t in prev) c[t]=(prev[t]||[]).map(m=>m===oldStored?newStored:m);
      return c;
    });
    setPaid(prev=>{
      const np={...prev};
      if(np[oldStored]) np[newStored]=np[oldStored];
      delete np[oldStored];
      return np;
    });

    // sync remote
    if(SB){ try{
      const teamRaw=Object.keys(teams).find(t=>(teams[t]||[]).includes(oldStored))||"";
      const method=paid[oldStored]||null;
      await sbUpsertPlayer({full_name:newStored,team:teamRaw,paid:!!method,payment_method:method});
      await sbDeletePlayer(oldStored);
    }catch(e){ setConn("local"); setConnErr(String(e?.message||e)); } }

    setShowEditModal(false);
    setEditTarget(null);
  };

  /* scores buttons */
  const inc = async(team,type,delta)=>{ 
    setScores(prev=>({...prev,[team]:nextScore(prev[team],type,delta)}));
    if(SB) try{ const cur=scores[team]||{win:0,lose:0}; const nv= type==="win"?{win:Math.max(0,cur.win+delta),lose:cur.lose}:{win:cur.win,lose:Math.max(0,cur.lose+delta)}; await sbUpsertScore(team,nv.win,nv.lose);}catch(e){setConn("local"); setConnErr(String(e?.message||e));}
  };

  /* payments */
  const openPayment=(n)=>{ setPayFor(n); setShowPayModal(true); };
  const setPayment=async(method)=>{ const name=payFor; if(!name) return; setPaid(prev=>{const np={...prev}; if(method) np[name]=method; else delete np[name]; return np;});
    if(SB){ try{ const teamRaw=Object.keys(teams).find(t=>(teams[t]||[]).includes(name))||""; await sbUpsertPlayer({full_name:name,team:teamRaw,paid:!!method,payment_method:method}); }catch(e){ setConn("local"); setConnErr(String(e?.message||e)); } }
    setShowPayModal(false); setPayFor(null);
  };

  /* delete / clear / logout */
  const requestDelete=(n)=>{ setDeleteTarget(n); setShowDeleteModal(true); };
  const doDelete=async()=>{ const n=deleteTarget; if(!n){setShowDeleteModal(false);return;}
    setIndividuals(prev=>prev.filter(x=>x!==n));
    setTeams(prev=>{const c={}; for(const k in prev) c[k]=prev[k].filter(m=>m!==n); return c;});
    setPaid(prev=>{const nn={...prev}; delete nn[n]; return nn;});
    if(SB) try{ await sbDeletePlayer(n);}catch(e){ setConn("local"); setConnErr(String(e?.message||e)); }
    setShowDeleteModal(false); setDeleteTarget(null);
  };
  const doClearAll=async()=>{ if(SB){ try{await sbDeleteAllPlayers();}catch(e){ setConn("local"); setConnErr(String(e?.message||e)); } }
    setIndividuals([]); setTeams(emptyTeams); setPaid({}); saveLocal(makeLocal({individuals:[],teams:emptyTeams,paid:{}})); setShowClearModal(false);
  };
  const doLogout=()=>{ setShowLogoutModal(false); onLogout(); };

  /* games (create w/o scores; edit scores later) */
  const resetGameForm=()=>{ setGTitle(""); setGDate(""); setGTime(""); setGLoc(""); setGTeamA(""); setGTeamB(""); };
  const addGame=async(e)=>{ e.preventDefault();
    const row={
      title:(gTitle||"").trim()||`Game ${(games?.length||0)+1}`,
      team_a: gTeamA,
      team_b: gTeamB,
      gdate: gDate || null,
      gtime: gTime || null,
      location: gLoc || null,
      score_a: 0,
      score_b: 0
    };
    if(SB){ try{
      const ins=await sbInsertGame(row);
      setGames(prev=>[...prev,{ id: ins.id, ...row }]);
    }catch(e){ setConn("local"); setConnErr(String(e?.message||e)); setGames(prev=>[...prev,{ id:crypto.randomUUID?.()||String(Date.now()), ...row }]); } }
    else setGames(prev=>[...prev,{ id:crypto.randomUUID?.()||String(Date.now()), ...row }]);
    resetGameForm();
  };

  const applyTeamDeltas = async (deltas) => {
    if (!deltas || deltas.length===0) return;
    let snapshot={};
    setScores(prev=>{
      const next={...prev};
      deltas.forEach(({team,winDelta=0,loseDelta=0})=>{
        const cur=next[team]||{win:0,lose:0};
        next[team]={win:Math.max(0,(cur.win||0)+winDelta),lose:Math.max(0,(cur.lose||0)+loseDelta)};
      });
      snapshot=next; return next;
    });
    if (SB){
      for (const {team} of deltas){
        const t=snapshot[team]||{win:0,lose:0};
        try{ await sbUpsertScore(team,t.win,t.lose);}catch(e){ setConn("local"); setConnErr(String(e?.message||e)); }
      }
    }
  };

  const requestEditGame=(g)=>{ setEditLocal({...g}); setShowGameEditModal(true); };
  const saveGameEdit=async()=>{ const g=editLocal; if(!g) return; const id=g.id;
    const oldGame=games.find(x=>x.id===id)||{};
    const row={
      title: (g.title||"").trim()||"Game",
      team_a: g.team_a,
      team_b: g.team_b,
      gdate: g.gdate || null,
      gtime: g.gtime || null,
      location: g.location || null,
      score_a: Number(g.score_a)||0,
      score_b: Number(g.score_b)||0
    };
    // record adjustment (auto W/L)
    const newGame={...oldGame,...row};
    const oldOc=getOutcome(oldGame);
    const newOc=getOutcome(newGame);
    const deltas=[];
    if (oldOc.type==="decided" && newOc.type==="decided"){
      if (oldOc.winner!==newOc.winner || oldOc.loser!==newOc.loser){
        deltas.push({team:oldOc.winner,winDelta:-1,loseDelta:0});
        deltas.push({team:oldOc.loser, winDelta:0, loseDelta:-1});
        deltas.push({team:newOc.winner,winDelta:+1,loseDelta:0});
        deltas.push({team:newOc.loser, winDelta:0, loseDelta:+1});
      }
    }else if (oldOc.type!=="decided" && newOc.type==="decided"){
      deltas.push({team:newOc.winner,winDelta:+1,loseDelta:0});
      deltas.push({team:newOc.loser, winDelta:0, loseDelta:+1});
    }else if (oldOc.type==="decided" && newOc.type!=="decided"){
      deltas.push({team:oldOc.winner,winDelta:-1,loseDelta:0});
      deltas.push({team:oldOc.loser, winDelta:0, loseDelta:-1});
    }
    if (deltas.length) await applyTeamDeltas(deltas);

    setGames(prev=>prev.map(x=>x.id===id?{...x,...row}:x));
    if(SB){ try{ await sbUpdateGame(id,row);}catch(e){ setConn("local"); setConnErr(String(e?.message||e)); } }
    setShowGameEditModal(false); setEditLocal(null);
  };
  const deleteGame=async(id)=>{
    const g=games.find(x=>x.id===id);
    if (g){
      const oc=getOutcome(g);
      if (oc.type==="decided"){
        await applyTeamDeltas([
          {team:oc.winner,winDelta:-1,loseDelta:0},
          {team:oc.loser, winDelta:0, loseDelta:-1},
        ]);
      }
    }
    setGames(prev=>prev.filter(x=>x.id!==id));
    if(SB){ try{ await sbDeleteGame(id);}catch(e){ setConn("local"); setConnErr(String(e?.message||e)); } }
  };

  const rosterFor=(letter)=>letter && teams[letter]?teams[letter]:[];

  /* ───────────────────────────── UI (Admin) ───────────────────────────── */
  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 md:p-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-2 flex items-center justify-between">
          <div />
          <span className={`inline-block px-2 py-1 rounded text-xs ${conn==="online"?"bg-green-100 text-green-700":conn==="checking"?"bg-yellow-100 text-yellow-800":"bg-gray-200 text-gray-700"}`}>
            {conn==="online"?"Supabase connected":conn==="checking"?"Checking…":"Local mode (not syncing)"}
          </span>
        </div>
        {conn!=="online" && connErr && (
          <div className="mb-4 text-sm bg-yellow-50 border border-yellow-200 text-yellow-800 rounded p-2">{connErr}</div>
        )}

        {/* header + add + counter + public link */}
        <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold">
              Perpetual Alumni Mini League
              <span className="ml-3 align-middle text-sm font-semibold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">
                {individuals.length} {individuals.length===1?"Player":"Players"}
              </span>
            </h1>
            <a
              className="text-sm h-10 px-4 rounded-xl border hover:bg-slate-50 inline-flex items-center"
              href={`${location.origin}${location.pathname}?public=1`}
              target="_blank" rel="noreferrer"
            >
              Open Public Link
            </a>
          </div>

          {/* Add Player */}
          <form onSubmit={add} className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3">
            <input className="border rounded-xl px-3 py-2 h-11 md:col-span-2" placeholder="Full name (e.g., Marvin)" value={newName} onChange={(e)=>setNewName(e.target.value)} />
            <input className="border rounded-xl px-3 py-2 h-11" placeholder="Jersey #" inputMode="numeric" value={newJersey} onChange={(e)=>setNewJersey(e.target.value)} />
            <select className="border rounded-xl px-3 py-2 h-11" value={newPos} onChange={(e)=>setNewPos(e.target.value)}>
              <option value="">Position</option>
              <option value="PG">PG</option><option value="SG">SG</option><option value="SF">SF</option><option value="PF">PF</option><option value="C">C</option>
            </select>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={newCaptain} onChange={(e)=>setNewCaptain(e.target.checked)} />
                Captain
              </label>
              <button className="ml-auto h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">Add</button>
            </div>
          </form>
        </div>

        {/* players */}
        <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6 mb-6">
          <h3 className="text-lg sm:text-xl font-semibold mb-3">Players (First-Come, First-Served)</h3>
          <ol className="space-y-2 list-decimal list-inside">
            {individuals.map((stored, idx)=>{
              const assigned=Object.keys(teams).find(t=>teams[t].includes(stored))||"";
              const method=paid[stored]; // "cash" | "gcash"
              const paidBadge = method==="gcash" ? "text-blue-700 bg-blue-100" : "text-green-700 bg-green-100";
              return (
                <li key={stored} ref={el=>{if(el) itemRefs.current[stored]=el;}}
                    className={"flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-lg px-2 py-1 "+(flashName===stored?"bg-yellow-50 ring-1 ring-yellow-200":"")}>
                  <span className="flex-1 font-medium">
                    <NameWithCaptain name={stored} />
                    {method && (
                      <span className={`ml-2 inline-flex items-center gap-1 ${paidBadge} px-2 py-0.5 rounded-full text-xs`}>
                        Paid ({method==="cash"?"Cash":"GCash"})
                      </span>
                    )}
                  </span>

                  <div className="flex flex-wrap items-center gap-2">
                    <select className="border rounded-lg px-2 py-2 h-9" value={assigned} onChange={(e)=>assign(stored,e.target.value)}>
                      <option value="">No Team</option>
                      {TEAMS.map(t=><option key={t} value={t}>Team {t}</option>)}
                    </select>
                    <button type="button" onClick={()=>{ setPayFor(stored); setShowPayModal(true); }} className={`h-9 px-3 rounded-lg text-white ${method==="gcash"?"bg-sky-700":method==="cash"?"bg-green-700":"bg-green-500"}`}>
                      {method ? "Change Paid" : "Paid"}
                    </button>
                    <button type="button" onClick={()=>openEdit(stored)} className="h-9 px-3 rounded-lg bg-yellow-500 text-white">Edit</button>
                    <button type="button" onClick={()=>{ setDeleteTarget(stored); setShowDeleteModal(true); }} className="h-9 px-3 rounded-lg bg-red-500 text-white">Delete</button>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* schedule */}
        <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6 mb-6">
          <h3 className="text-lg sm:text-xl font-semibold mb-3">Game Schedule</h3>
          <form onSubmit={addGame} className="grid grid-cols-1 md:grid-cols-8 gap-2 md:gap-3 mb-4">
            <input className="border rounded-xl px-3 py-2 h-11 md:col-span-2" placeholder={`Title (e.g., Game ${(games?.length||0)+1})`} value={gTitle} onChange={(e)=>setGTitle(e.target.value)} />
            <select className="border rounded-xl px-3 py-2 h-11" value={gTeamA} onChange={e=>setGTeamA(e.target.value)}>
              <option value="">-------</option>{TEAMS.map(t=><option key={t} value={t}>Team {t}</option>)}
            </select>
            <select className="border rounded-xl px-3 py-2 h-11" value={gTeamB} onChange={e=>setGTeamB(e.target.value)}>
              <option value="">-------</option>{TEAMS.map(t=><option key={t} value={t}>Team {t}</option>)}
            </select>
            <input className="border rounded-xl px-3 py-2 h-11" type="date" value={gDate} onChange={e=>setGDate(e.target.value)} />
            <input className="border rounded-xl px-3 py-2 h-11" type="time" value={gTime} onChange={e=>setGTime(e.target.value)} />
            <input className="border rounded-xl px-3 py-2 h-11 md:col-span-2" placeholder="Location / Court" value={gLoc} onChange={e=>setGLoc(e.target.value)} />
            <button className="h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white md:col-span-2">Create Match</button>
          </form>

          <div className="space-y-3">
            {games.length===0 ? (
              <div className="text-gray-500 text-sm">No games yet. Create one above.</div>
            ) : games.map((g,idx)=>{
              const a=g.team_a?.trim(), b=g.team_b?.trim();
              const rosterA=rosterFor(a), rosterB=rosterFor(b);
              const wLabel = winnerLabel(g);
              return (
                <div key={g.id} className="border rounded-2xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
                    <div className="font-semibold min-w-24">{g.title || `Game ${idx+1}`}</div>
                    <div className="text-sm text-gray-700 flex-1">
                      {(a||b)?<span>Team {a||"?"} vs Team {b||"?"}</span>:<span className="text-gray-400">Unassigned teams</span>}
                      <span className="ml-3">{g.gdate ? new Date(g.gdate).toLocaleDateString() : "No date"}{g.gtime ? ` ${g.gtime}` : ""}</span>
                      {g.location ? <span className="ml-3">• {g.location}</span> : null}
                    </div>
                    <div className="hidden sm:flex items-center gap-2">
                      <span className="px-2 py-1 rounded bg-slate-100 text-sm">Score: {g.score_a} — {g.score_b}</span>
                      <span className={`px-2 py-1 rounded text-xs ${wLabel.startsWith("Team")? "bg-emerald-100 text-emerald-700":"bg-slate-100 text-slate-700"}`}>
                        Winner: {wLabel}
                      </span>
                      <button className="h-9 px-3 rounded-lg bg-yellow-500 text-white" onClick={()=>{setEditLocal(g); setShowGameEditModal(true);}}>Edit</button>
                      <button className="h-9 px-3 rounded-lg bg-red-500 text-white" onClick={()=>deleteGame(g.id)}>Delete</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {rosterA.length>0 && (
                      <div className="rounded-lg border p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium">Team {a || "?"} Roster</div>
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold">Score: {g.score_a||0}</span>
                        </div>
                        <ul className="text-sm list-disc list-inside space-y-1">
                          {rosterA.map((raw,i)=>(<li key={raw+i}><NameWithCaptain name={raw} /></li>))}
                        </ul>
                      </div>
                    )}
                    {rosterB.length>0 && (
                      <div className="rounded-lg border p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium">Team {b || "?"} Roster</div>
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold">Score: {g.score_b||0}</span>
                        </div>
                        <ul className="text-sm list-disc list-inside space-y-1">
                          {rosterB.map((raw,i)=>(<li key={raw+i}><NameWithCaptain name={raw} /></li>))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 sm:hidden flex items-center gap-2">
                    <span className="px-2 py-1 rounded bg-slate-100 text-sm">Score: {g.score_a} — {g.score_b}</span>
                    <span className={`px-2 py-1 rounded text-xs ${wLabel.startsWith("Team")? "bg-emerald-100 text-emerald-700":"bg-slate-100 text-slate-700"}`}>
                      Winner: {wLabel}
                    </span>
                    <button className="h-9 px-3 rounded-lg bg-yellow-500 text-white" onClick={()=>{setEditLocal(g); setShowGameEditModal(true);}}>Edit</button>
                    <button className="h-9 px-3 rounded-lg bg-red-500 text-white" onClick={()=>deleteGame(g.id)}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* teams */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {TEAMS.map(team=>{
            const w=scores[team]?.win??0, l=scores[team]?.lose??0;
            return (
              <section key={team} className="bg-white rounded-2xl shadow-sm border p-4 sm:p-5">
                <h2 className="text-lg sm:text-xl font-semibold mb-3">
                  Team {team}
                  <span className="ml-3 text-sm font-normal">(<span className="text-green-600">Win {w}</span> / <span className="text-red-600">Lose {l}</span>)</span>
                </h2>
                <div className="flex flex-wrap gap-2 mb-3">
                  <button onClick={()=>inc(team,"win", 1)} className="h-9 px-3 border rounded-lg">+W</button>
                  <button onClick={()=>inc(team,"win",-1)} className="h-9 px-3 border rounded-lg">-W</button>
                  <button onClick={()=>inc(team,"lose", 1)} className="h-9 px-3 border rounded-lg">+L</button>
                  <button onClick={()=>inc(team,"lose",-1)} className="h-9 px-3 border rounded-lg">-L</button>
                </div>
                <ul className="space-y-2">
                  {(teams[team]||[]).length ? (teams[team]||[]).map((raw,i)=>{
                    const method=paid[raw];
                    const badge = method==="gcash" ? "text-blue-700 bg-blue-100" : "text-green-700 bg-green-100";
                    return (
                      <li key={raw} className="flex items-center gap-2">
                        <span className="font-medium w-6 text-right">{i+1}.</span>
                        <span className="flex-1">
                          <NameWithCaptain name={raw} />
                          {method && <span className={`ml-2 inline-flex items-center gap-1 ${badge} px-2 py-0.5 rounded-full text-xs`}>Paid ({method==="cash"?"Cash":"GCash"})</span>}
                        </span>
                        <button onClick={()=>assign(raw,"")} className="h-9 px-3 rounded-lg bg-red-500 text-white">Remove</button>
                      </li>
                    );
                  }) : <li className="text-gray-400">No players</li>}
                </ul>
              </section>
            );
          })}
        </div>

        {/* footer actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
          <button onClick={()=>setShowClearModal(true)} className="h-10 px-5 rounded-xl border text-red-700 border-red-300 hover:bg-red-50">Clear All Players</button>
          <button onClick={()=>setShowLogoutModal(true)} className="h-10 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white">Logout</button>
        </div>
      </div>

      {/* Payment modal */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 grid place-items-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=>{setShowPayModal(false); setPayFor(null);}}/>
          <div className="relative bg-white rounded-2xl shadow-xl p-5 w-[92%] max-w-sm">
            <h4 className="text-lg font-semibold mb-3">Set Payment for</h4>
            <div className="mb-4 font-medium">{payFor}</div>
            <div className="grid grid-cols-1 gap-2">
              <button onClick={()=>setPayment("cash")} className="h-11 rounded-lg bg-green-600 text-white">Cash</button>
              <button onClick={()=>setPayment("gcash")} className="h-11 rounded-lg bg-sky-600 text-white">GCash</button>
              <button onClick={()=>setPayment(null)} className="h-11 rounded-lg border">Clear / Unpaid</button>
            </div>
            <div className="mt-3 text-right">
              <button onClick={()=>{setShowPayModal(false); setPayFor(null);}} className="h-9 px-3 rounded-lg border">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete player confirm */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 grid place-items-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=>{setShowDeleteModal(false); setDeleteTarget(null);}}/>
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-[92%] max-w-md">
            <h4 className="text-lg font-semibold mb-2">Delete player?</h4>
            <p className="text-sm text-gray-600 mb-4">This will remove <span className="font-medium">{deleteTarget}</span> from the list and any team assignments.</p>
            <div className="flex justify-end gap-2">
              <button onClick={()=>{setShowDeleteModal(false); setDeleteTarget(null);}} className="h-10 px-4 rounded-lg border">Cancel</button>
              <button onClick={doDelete} className="h-10 px-4 rounded-lg bg-red-600 text-white">Yes, Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Clear all */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 grid place-items-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=>setShowClearModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-[92%] max-w-md">
            <h4 className="text-lg font-semibold mb-2">Clear ALL registered players?</h4>
            <p className="text-sm text-gray-600 mb-4">This removes every player and team assignment. This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setShowClearModal(false)} className="h-10 px-4 rounded-lg border">Cancel</button>
              <button onClick={doClearAll} className="h-10 px-4 rounded-lg bg-red-600 text-white">Yes, Clear All</button>
            </div>
          </div>
        </div>
      )}

      {/* Logout confirm */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 grid place-items-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=>setShowLogoutModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-[92%] max-w-md">
            <h4 className="text-lg font-semibold mb-2">Log out?</h4>
            <p className="text-sm text-gray-600 mb-4">You will be returned to the login screen.</p>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setShowLogoutModal(false)} className="h-10 px-4 rounded-lg border">Cancel</button>
              <button onClick={()=>{setShowLogoutModal(false); onLogout();}} className="h-10 px-4 rounded-lg bg-rose-600 text-white">Yes, Logout</button>
            </div>
          </div>
        </div>
      )}

      {/* Player Edit (with Captain toggle and Position selector including C) */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 grid place-items-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=>{setShowEditModal(false); setEditTarget(null);}} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-[92%] max-w-md">
            <h4 className="text-lg font-semibold mb-3">Edit Player</h4>
            <div className="grid grid-cols-1 gap-3">
              <input className="border rounded-lg px-3 py-2 h-11" placeholder="Full name" value={editBaseName} onChange={e=>setEditBaseName(e.target.value)} />
              <input className="border rounded-lg px-3 py-2 h-11" placeholder="Jersey #" value={editJersey} onChange={e=>setEditJersey(e.target.value)} />
              <select className="border rounded-lg px-3 py-2 h-11" value={editPos} onChange={e=>setEditPos(e.target.value)}>
                <option value="">Position</option>
                <option value="PG">PG</option><option value="SG">SG</option><option value="SF">SF</option><option value="PF">PF</option><option value="C">C</option>
              </select>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editCaptain} onChange={e=>setEditCaptain(e.target.checked)} />
                Captain
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={()=>{setShowEditModal(false); setEditTarget(null);}} className="h-10 px-4 rounded-lg border">Cancel</button>
              <button onClick={saveEdit} className="h-10 px-4 rounded-lg bg-blue-600 text-white">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Game edit (scores editable here; auto W/L on save) */}
      {showGameEditModal && editLocal && (
        <div className="fixed inset-0 z-50 grid place-items-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=>{setShowGameEditModal(false); setEditLocal(null);}} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-[92%] max-w-lg">
            <h4 className="text-lg font-semibold mb-3">Edit Game (Set Scores Here)</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input className="border rounded-lg px-3 py-2 h-11" placeholder="Title" value={editLocal.title||""} onChange={e=>setEditLocal({...editLocal,title:e.target.value})}/>
              <input className="border rounded-lg px-3 py-2 h-11" type="date" value={editLocal.gdate||""} onChange={e=>setEditLocal({...editLocal,gdate:e.target.value})}/>
              <input className="border rounded-lg px-3 py-2 h-11" type="time" value={editLocal.gtime||""} onChange={e=>setEditLocal({...editLocal,gtime:e.target.value})}/>
              <input className="border rounded-lg px-3 py-2 h-11" placeholder="Location" value={editLocal.location||""} onChange={e=>setEditLocal({...editLocal,location:e.target.value})}/>
              <select className="border rounded-lg px-3 py-2 h-11" value={editLocal.team_a||""} onChange={e=>setEditLocal({...editLocal,team_a:e.target.value})}>
                <option value="">-------</option>{TEAMS.map(t=><option key={t} value={t}>Team {t}</option>)}
              </select>
              <select className="border rounded-lg px-3 py-2 h-11" value={editLocal.team_b||""} onChange={e=>setEditLocal({...editLocal,team_b:e.target.value})}>
                <option value="">-------</option>{TEAMS.map(t=><option key={t} value={t}>Team {t}</option>)}
              </select>
              <input className="border rounded-lg px-3 py-2 h-11" type="number" min="0" placeholder="Score A" value={editLocal.score_a??0} onChange={e=>setEditLocal({...editLocal,score_a:e.target.value})}/>
              <input className="border rounded-lg px-3 py-2 h-11" type="number" min="0" placeholder="Score B" value={editLocal.score_b??0} onChange={e=>setEditLocal({...editLocal,score_b:e.target.value})}/>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={()=>{setShowGameEditModal(false); setEditLocal(null);}} className="h-10 px-4 rounded-lg border">Cancel</button>
              <button onClick={async()=>{await saveGameEdit();}} className="h-10 px-4 rounded-lg bg-blue-600 text-white">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── Public (read-only) ────────────────────────── */
function PublicBoard(){
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState("");
  const [players,setPlayers]=useState([]);
  const [teams,setTeams]=useState(TEAMS.reduce((a,t)=>{a[t]=[];return a;},{}));
  const [scores,setScores]=useState(TEAMS.reduce((a,t)=>{a[t]={win:0,lose:0};return a;},{}));
  const [games,setGames]=useState([]);

  const applyRemote=useCallback((data)=>{
    const {players:p=[], scores:s=[], games:g=[]}=data||{};
    setPlayers(p.map(x=>x.full_name));
    const t=TEAMS.reduce((a,k)=>{a[k]=[];return a;},{}); p.forEach(x=>{ if(x.team && t[x.team]) t[x.team].push(x.full_name); }); setTeams(t);
    const sc=TEAMS.reduce((a,k)=>{a[k]={win:0,lose:0};return a;},{}); (s||[]).forEach(r=>{ if(sc[r.team]) sc[r.team]={win:r.wins||0,lose:r.losses||0};}); setScores(sc);
    setGames((g||[]).map(row=>({
      id: row.id,
      title: row.title || "",
      team_a: row.team_a || "",
      team_b: row.team_b || "",
      gdate: row.gdate || "",
      gtime: row.gtime || "",
      location: row.location || "",
      score_a: Number.isFinite(row.score_a) ? row.score_a : 0,
      score_b: Number.isFinite(row.score_b) ? row.score_b : 0
    })));
  },[]);

  useEffect(()=>{ (async()=>{ try{ if(!window.sb) throw new Error("Supabase not initialized"); const data=await sbFetchAll(); applyRemote(data); setErr(""); }catch(e){ setErr(String(e?.message||e)); }finally{ setLoading(false); } })(); },[applyRemote]);
  useEffect(()=>{ if(!SB) return; const ch=SB.channel("public-board")
    .on("postgres_changes",{event:"*",schema:"public",table:"players"},()=>refetch())
    .on("postgres_changes",{event:"*",schema:"public",table:"team_scores"},()=>refetch())
    .on("postgres_changes",{event:"*",schema:"public",table:"games"},()=>refetch())
    .subscribe();
    async function refetch(){ try{ applyRemote(await sbFetchAll()); }catch{} }
    return ()=>{ try{SB.removeChannel(ch);}catch{} };
  },[applyRemote]);

  const nonEmptyTeams = TEAMS.filter(t => (teams[t] || []).length > 0);

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 md:p-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold">
            League Summary (Public)
            <span className="ml-3 text-sm font-semibold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">
              {players.length} {players.length===1?"Player":"Players"}
            </span>
          </h1>
          <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">Live</span>
        </div>

        {loading && <div className="text-gray-500">Loading…</div>}
        {!loading && err && <div className="mb-4 text-sm bg-yellow-50 border border-yellow-200 text-yellow-800 rounded p-2">{err}</div>}

        <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6 mb-6">
          <h3 className="text-lg sm:text-xl font-semibold mb-3">Game Schedule</h3>
          {games.length===0 ? (
            <div className="text-gray-500 text-sm">No games scheduled yet.</div>
          ) : (
            <div className="space-y-3">
              {games.map((g,idx)=>{
                const a=g.team_a?.trim(), b=g.team_b?.trim();
                const rosterA=a?(teams[a]||[]):[], rosterB=b?(teams[b]||[]):[];
                const wLabel = winnerLabel(g);
                const showA = rosterA.length > 0;
                const showB = rosterB.length > 0;
                return (
                  <div key={g.id||idx} className="border rounded-2xl p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
                      <div className="font-semibold min-w-24">{g.title || `Game ${idx+1}`}</div>
                      <div className="text-sm text-gray-700 flex-1">
                        {(a||b)?<span>Team {a||"?"} vs Team {b||"?"}</span>:<span className="text-gray-400">Unassigned teams</span>}
                        <span className="ml-3">{g.gdate ? new Date(g.gdate).toLocaleDateString() : "No date"}{g.gtime ? ` ${g.gtime}` : ""}</span>
                        {g.location ? <span className="ml-3">• {g.location}</span> : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 rounded bg-slate-100 text-sm">Score: {g.score_a} — {g.score_b}</span>
                        <span className={`px-2 py-1 rounded text-xs ${wLabel.startsWith("Team")? "bg-emerald-100 text-emerald-700":"bg-slate-100 text-slate-700"}`}>
                          Winner: {wLabel}
                        </span>
                      </div>
                    </div>

                    {(showA || showB) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {showA && (
                          <div className="rounded-lg border p-3">
                            <div className="font-medium mb-2">Team {a || "?"} Roster</div>
                            <ul className="text-sm list-disc list-inside space-y-1">
                              {(teams[a]||[]).map((raw,i)=>(<li key={raw+i}><NameWithCaptain name={raw} /></li>))}
                            </ul>
                          </div>
                        )}
                        {showB && (
                          <div className="rounded-lg border p-3">
                            <div className="font-medium mb-2">Team {b || "?"} Roster</div>
                            <ul className="text-sm list-disc list-inside space-y-1">
                              {(teams[b]||[]).map((raw,i)=>(<li key={raw+i}><NameWithCaptain name={raw} /></li>))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {nonEmptyTeams.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {nonEmptyTeams.map(team=>{
              const roster = teams[team] || [];
              const w=scores[team]?.win??0, l=scores[team]?.lose??0;
              return (
                <section key={team} className="bg-white rounded-2xl shadow-sm border p-4 sm:p-5">
                  <h2 className="text-lg sm:text-xl font-semibold mb-3">
                    Team {team}
                    <span className="ml-3 text-sm font-normal">(<span className="text-green-600">Win {w}</span> / <span className="text-red-600">Lose {l}</span>)</span>
                  </h2>
                  <ul className="space-y-2">
                    {roster.map((raw)=> (
                      <li key={raw} className="flex items-center gap-2">
                        <span className="flex-1"><NameWithCaptain name={raw} /></span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        <div className="mt-6 text-center text-sm text-gray-500">Read-only public view • refreshes automatically</div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── App switch ─────────────────────────────── */
export default function App(){
  const isPublic = typeof window!=="undefined" && new URLSearchParams(window.location.search).get("public")==="1";
  if (isPublic) return <PublicBoard />;
  const { user, login, logout } = useAuthUser();
  return user ? <League onLogout={logout}/> : <Login onLogin={login}/>;
}
