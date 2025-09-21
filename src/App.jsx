// src/App.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase as SB } from "./lib/supabase";

/* ============================= constants/utils ============================= */
const TEAMS = ["A","B","C","D","E","F","G","H","I","J"];
const EMPTY_TEAMS = TEAMS.reduce((a,t)=>{a[t]=[];return a;}, {});
const LS_KEY        = "paml:v45";
const LS_LOGS       = "paml_logs:v1";
const LS_LOGS_BUMP  = "paml_logs_bump:v1";

const getLocal = () => { try { const s=localStorage.getItem(LS_KEY); return s?JSON.parse(s):null; } catch { return null; } };
const setLocal = (x) => { try { localStorage.setItem(LS_KEY, JSON.stringify(x)); } catch {} };

const getLocalLogs = () => { try { const s=localStorage.getItem(LS_LOGS); return s?JSON.parse(s):{}; } catch { return {}; } };
const setLocalLogs = (obj) => { try { localStorage.setItem(LS_LOGS, JSON.stringify(obj)); } catch {} };

const POS_RE=/^(PG|SG|SF|PF|C)$/i;
const CAP_RE=/^(CAPTAIN|CAP)$/i;
const normTeam=(v)=>{const x=(v??"").trim(); return x?x:null;};
const nextScore=(prev,type,d)=>({ ...prev, [type]: Math.max(0, Number(prev?.[type]??0)+Number(d||0)) });
const todayISO = () => new Date().toISOString().slice(0,10);
const monthName = (i)=>["January","February","March","April","May","June","July","August","September","October","November","December"][i];
const fmtMDY = (iso) => {
  if(!iso) return "No date";
  const d = new Date(iso+"T00:00:00");
  if(Number.isNaN(+d)) return "No date";
  const m = monthName(d.getMonth());
  const dd = String(d.getDate()).padStart(2,"0");
  const yyyy = d.getFullYear();
  return `${m}/${dd}/${yyyy}`;
};

/* name helpers */
function parseStoredName(raw){
  const s=String(raw||"");
  const m=s.match(/^(.*?)(\s*\((.*)\))\s*$/);
  const baseWithJersey=(m?m[1]:s).trim();
  const insideRaw=m?(m[3]||""):"";
  const tokens=insideRaw.split(",").map(t=>t.trim()).filter(Boolean);
  let isCaptain=false; const otherTags=[]; const seen=new Set();
  for(const t of tokens){
    if(CAP_RE.test(t)){isCaptain=true;continue;}
    const up=t.toUpperCase(); if(!seen.has(up)){seen.add(up); otherTags.push(up);}
  }
  return {baseWithJersey,isCaptain,otherTags};
}
function composeStoredName(baseWithJersey,isCaptain,otherTags){
  const tags=[]; const seen=new Set();
  (otherTags||[]).forEach(t=>{const up=String(t||"").toUpperCase().trim(); if(up&&!seen.has(up)){seen.add(up); tags.push(up);}});
  if(isCaptain) tags.push("CAPTAIN");
  return `${baseWithJersey}${tags.length?` (${tags.join(", ")})`:""}`;
}
function NameWithCaptain({name,className=""}){
  const {baseWithJersey,isCaptain,otherTags}=parseStoredName(name);
  const tags=otherTags.filter(t=>!CAP_RE.test(t));
  return (
    <span className={className}>
      {baseWithJersey}
      {(tags.length||isCaptain)?<> {`(`}
        {tags.map((t,i)=><span key={i}>{t}{i<tags.length-1||isCaptain?", ":""}</span>)}
        {isCaptain && <span className="text-red-700 font-semibold">Captain</span>}
        {`)`}
      </>:null}
    </span>
  );
}

/* outcomes */
function getOutcome(g){
  const ta=g?.team_a||""; const tb=g?.team_b||"";
  const a=Number(g?.score_a??0), b=Number(g?.score_b??0);
  if(!ta||!tb) return {type:"invalid"};
  if(a===b) return {type:"tie",a:ta,b:tb};
  if(a>b) return {type:"decided",winner:ta,loser:tb};
  return {type:"decided",winner:tb,loser:ta};
}
const winnerLabel=(g)=>{const o=getOutcome(g); if(o.type==="decided") return `Team ${o.winner}`; if(o.type==="tie") return "Tie"; return "TBD";};

/* ================================ Supabase ================================ */
async function sbFetchAll(){
  const [
    {data:players,error:ep},
    {data:scores,error:es},
    {data:games,error:eg}
  ]=await Promise.all([
    SB.from("players").select("full_name,team,paid,payment_method").order("full_name",{ascending:true}),
    SB.from("team_scores").select("team,wins,losses"),
    SB.from("games").select("id,title,team_a,team_b,gdate,gtime,location,score_a,score_b").order("title",{ascending:true}),
  ]);
  if(ep||es||eg) throw (ep||es||eg);
  return {players:players||[],scores:scores||[],games:games||[]};
}
async function sbUpsertPlayer(row){const {error}=await SB.from("players").upsert({...row,team:normTeam(row.team)}); if(error) throw error;}
async function sbDeletePlayer(name){const {error}=await SB.from("players").delete().eq("full_name",name); if(error) throw error;}
async function sbDeleteAllPlayers(){const {error}=await SB.from("players").delete().neq("full_name",""); if(error) throw error;}
async function sbUpsertScore(team,wins,losses){const {error}=await SB.from("team_scores").upsert({team,wins,losses},{onConflict:"team"}); if(error) throw error;}
async function sbInsertGame(row){const {data,error}=await SB.from("games").insert({...row,team_a:normTeam(row.team_a),team_b:normTeam(row.team_b)}).select().single(); if(error) throw error; return data;}
async function sbUpdateGame(id,row){const {error}=await SB.from("games").update({...row,team_a:normTeam(row.team_a),team_b:normTeam(row.team_b)}).eq("id",id); if(error) throw error;}
async function sbDeleteGame(id){const {error}=await SB.from("games").delete().eq("id",id); if(error) throw error;}
async function sbDeleteAllGames(){
  const {data,error}=await SB.from("games").select("id"); if(error) throw error;
  const ids=(data||[]).map(r=>r.id); if(!ids.length) return;
  for(let i=0;i<ids.length;i+=500){const {error:e2}=await SB.from("games").delete().in("id",ids.slice(i,i+500)); if(e2) throw e2;}
}

/* ---------- Logs via Supabase (fallback to localStorage) ---------- */
async function sbListLogs(){
  try{
    const {data,error}=await SB.from("league_logs").select("log_date").order("log_date",{ascending:false});
    if(error) throw error;
    return (data||[]).map(r=>r.log_date);
  }catch{
    const map=getLocalLogs();
    return Object.keys(map).sort((a,b)=>b.localeCompare(a));
  }
}
async function adminListLogsMerged(){
  const server = await sbListLogs();
  const localMap = getLocalLogs();
  const localDates = Object.keys(localMap||{});
  const set = new Set([...(server||[]), ...localDates]);
  return Array.from(set).sort((a,b)=>b.localeCompare(a));
}
async function sbSaveLog(dateISO,payload){
  try{
    const {error}=await SB.from("league_logs").upsert({log_date:dateISO,payload},{onConflict:"log_date"});
    if(error) throw error;
  }catch{
    const map=getLocalLogs(); map[dateISO]=payload; setLocalLogs(map);
  }
}
async function sbGetLog(dateISO){
  try{
    const {data,error}=await SB.from("league_logs").select("payload").eq("log_date",dateISO).single();
    if(error) throw error;
    return data?.payload||null;
  }catch{
    const map=getLocalLogs(); return map[dateISO]||null;
  }
}
async function sbClearLogs() {
  try {
    const sel = await SB.from("league_logs").select("log_date");
    if (sel.error) throw sel.error;
    const keys = (sel.data || []).map(r => r.log_date);
    if (keys.length === 0) return true;
    for (let i = 0; i < keys.length; i += 300) {
      const chunk = keys.slice(i, i + 300);
      const del = await SB.from("league_logs").delete().in("log_date", chunk);
      if (del.error) throw del.error;
    }
    return true;
  } catch (e) {
    console.error("[sbClearLogs] failed:", e);
    return false;
  }
}

/* ================================ Auth ================================ */
function useAuth(){
  const k="auth_user"; const [user,setUser]=useState(()=>localStorage.getItem(k));
  return { user, login:(u)=>{localStorage.setItem(k,u); setUser(u);}, logout:()=>{localStorage.removeItem(k); setUser(null);} };
}

/* ================================= UI ================================= */
function Login({onLogin}){
  const [u,setU]=useState(""),[p,setP]=useState("");
  const U=import.meta.env?.VITE_APP_USERNAME||"Admin";
  const P=import.meta.env?.VITE_APP_PASSWORD||"Dog13";
  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center">Login</h1>
        <form className="space-y-3" onSubmit={(e)=>{e.preventDefault(); if(u===U&&p===P) onLogin(u); else alert("Invalid");}}>
          <input className="w-full h-11 px-3 border rounded-xl" placeholder="Username" value={u} onChange={e=>setU(e.target.value)} />
          <input className="w-full h-11 px-3 border rounded-xl" type="password" placeholder="Password" value={p} onChange={e=>setP(e.target.value)} />
          <button className="w-full h-11 rounded-xl bg-blue-600 text-white">Login</button>
        </form>
      </div>
    </div>
  );
}

/* =============================== League =============================== */
function League({onLogout}){
  // players & order
  const [individuals,setIndividuals]=useState([]);
  const [addedSeq,setAddedSeq]=useState([]); // oldest -> newest
  const [teams,setTeams]=useState(EMPTY_TEAMS);
  const [paid,setPaid]=useState({});

  // scores
  const [scores,setScores]=useState(TEAMS.reduce((a,t)=>{a[t]={win:0,lose:0};return a;},{}));

  // schedule
  const [games,setGames]=useState([]);
  const [gTitle,setGTitle]=useState(""),[gTeamA,setGTeamA]=useState(""),[gTeamB,setGTeamB]=useState(""),[gTime,setGTime]=useState(""),[gLoc,setGLoc]=useState("Gym 1");

  // logs (admin)
  const [logDate,setLogDate]=useState(todayISO());
  const [viewDate,setViewDate]=useState("LIVE");
  const [logDates,setLogDates]=useState([]);

  // misc
  const [sortMode,setSortMode]=useState("recent");
  const [conn,setConn]=useState("checking"),[connErr,setConnErr]=useState("");
  const [flash,setFlash]=useState(null);

  // modals
  const [showDeleteModal,setShowDeleteModal]=useState(false); const [deleteTarget,setDeleteTarget]=useState(null);
  const [showPayModal,setShowPayModal]=useState(false); const [payTarget,setPayTarget]=useState(null);
  const [showClearModal,setShowClearModal]=useState(false); const [showLogoutModal,setShowLogoutModal]=useState(false);
  const [showEditModal,setShowEditModal]=useState(false);
  const [editTarget,setEditTarget]=useState(null),[editBase,setEditBase]=useState(""),[editJersey,setEditJersey]=useState(""),[editPos,setEditPos]=useState(""),[editCaptain,setEditCaptain]=useState(false);
  const [showGameEditModal,setShowGameEditModal]=useState(false); const [editGame,setEditGame]=useState(null);

  // Clear Logs modal
  const [showClearLogsModal,setShowClearLogsModal]=useState(false);
  const [clearPwd,setClearPwd]=useState("");

  // add form
  const [newName,setNewName]=useState(""),[newJersey,setNewJersey]=useState(""),[newPos,setNewPos]=useState(""),[newCaptain,setNewCaptain]=useState(false);

  const makePayload=()=>({
    individuals, addedSeq, teams, paid, scores, games, sortMode,
    meta:{ saved_at:new Date().toISOString() }
  });
  const applyPayload=(p)=>{
    setIndividuals(p.individuals||[]);
    setAddedSeq((p.addedSeq||[]).filter(n=>(p.individuals||[]).includes(n)));
    setTeams(p.teams||EMPTY_TEAMS);
    setPaid(p.paid||{});
    setScores(p.scores||TEAMS.reduce((a,t)=>{a[t]={win:0,lose:0};return a;},{}));
    setGames(p.games||[]);
    setSortMode(p.sortMode||"recent");
  };
  const makeLocal=(extra={})=>({...makePayload(),...extra});

  /* ---------- load live ---------- */
  useEffect(()=>{(async()=>{
    const localSnap=getLocal();
    try{
      if(!SB) throw new Error("Supabase not initialized");
      await SB.from("players").select("full_name").limit(1);
      setConn("online");
      const data=await sbFetchAll();
      applyRemote(data, localSnap?.addedSeq||[]);
    }catch(e){
      setConn("local"); setConnErr(String(e?.message||e));
      if(localSnap) applyPayload(localSnap);
    }
    const dates=await adminListLogsMerged(); setLogDates(dates);
  })();},[]);

  /* live sync (only LIVE) */
  useEffect(()=>{ if(!SB || viewDate!=="LIVE") return;
    const ch=SB.channel("league-sync")
      .on("postgres_changes",{event:"*",schema:"public",table:"players"},()=>refetch())
      .on("postgres_changes",{event:"*",schema:"public",table:"team_scores"},()=>refetch())
      .on("postgres_changes",{event:"*",schema:"public",table:"games"},()=>refetch())
      .subscribe();
    async function refetch(){ try{ const data=await sbFetchAll(); applyRemote(data, addedSeq); }catch{} }
    return ()=>{ try{SB.removeChannel(ch);}catch{} };
  },[addedSeq,viewDate]);

  const ensureSeq=(names,seq=[])=>{
    const s=seq.filter(n=>names.includes(n));
    names.forEach(n=>{ if(!s.includes(n)) s.push(n); });
    return s;
  };
  const applyRemote=(data, baseSeq=[])=>{
    const ps=data.players||[];
    const names=ps.map(p=>p.full_name);
    setIndividuals(names);
    setAddedSeq(ensureSeq(names, baseSeq));
    const t=TEAMS.reduce((a,k)=>{a[k]=[];return a;},{}); ps.forEach(p=>{ if(p.team&&t[p.team]) t[p.team].push(p.full_name); }); setTeams(t);
    setPaid(ps.reduce((a,p)=>{ if(p.payment_method||p.paid) a[p.full_name]=p.payment_method||"cash"; return a; },{}));
    const s=TEAMS.reduce((a,k)=>{a[k]={win:0,lose:0};return a;},{}); (data.scores||[]).forEach(r=>{ if(s[r.team]) s[r.team]={win:r.wins||0,lose:r.losses||0}; }); setScores(s);
    setGames((data.games||[]).map(g=>({id:g.id,title:g.title||"",team_a:g.team_a||"",team_b:g.team_b||"",gdate:g.gdate||"",gtime:g.gtime||"",location:g.location||"",score_a:Number.isFinite(g.score_a)?g.score_a:0,score_b:Number.isFinite(g.score_b)?g.score_b:0})));
    setLocal(makeLocal({}));
  };

  useEffect(()=>{ if(viewDate==="LIVE") setLocal(makeLocal()); },[individuals,addedSeq,teams,paid,scores,games,sortMode,viewDate]);

  /* ----- add player (newest at bottom) ----- */
  const composeBaseWithJersey=(name,jersey)=>((name||"").trim()) + ((jersey||"").trim()?` #${(jersey||"").trim()}`:"");
  const addPlayer=(e)=>{
    e.preventDefault();
    const base=(newName||"").trim(); if(!base) return;
    const baseWithJersey=composeBaseWithJersey(base,newJersey);
    const tags=[]; if(newPos) tags.push(newPos.toUpperCase());
    const stored=composeStoredName(baseWithJersey,newCaptain,tags);
    setIndividuals(p=>[...p,stored]);
    setAddedSeq(seq=>[...seq, stored]);
    setNewName(""); setNewJersey(""); setNewPos(""); setNewCaptain(false);
    if(SB && viewDate==="LIVE") sbUpsertPlayer({full_name:stored,team:null,paid:false,payment_method:null}).catch(e=>{setConn("local"); setConnErr(String(e?.message||e));});
    setFlash(stored); setTimeout(()=>setFlash(null),900);
  };

  const assignTeam=(name,team)=>{
    setTeams(prev=>{
      const cleared=Object.fromEntries(Object.entries(prev).map(([k,a])=>[k,a.filter(n=>n!==name)]));
      if(team) cleared[team]=[...(cleared[team]||[]),name];
      return cleared;
    });
    if(SB && viewDate==="LIVE") sbUpsertPlayer({full_name:name,team,paid:!!paid[name],payment_method:paid[name]||null}).catch(e=>{setConn("local"); setConnErr(String(e?.message||e));});
  };

  const openEdit=(stored)=>{
    setEditTarget(stored);
    const {baseWithJersey,isCaptain,otherTags}=parseStoredName(stored);
    const m=baseWithJersey.match(/^(.*?)(?:\s*#(\d+))?$/);
    setEditBase((m?.[1]||"").trim()); setEditJersey((m?.[2]||"").trim());
    setEditPos((otherTags.find(t=>POS_RE.test(t))||"").toUpperCase()); setEditCaptain(!!isCaptain);
    setShowEditModal(true);
  };
  const saveEdit=async()=>{
    const old=editTarget; if(!old) return;
    const baseWithJersey=composeBaseWithJersey(editBase,editJersey);
    const next=composeStoredName(baseWithJersey,editCaptain,editPos?[editPos]:[]);
    setIndividuals(p=>p.map(n=>n===old?next:n));
    setAddedSeq(seq=>seq.map(n=>n===old?next:n));
    setTeams(prev=>{const cp={}; for(const k in prev) cp[k]=(prev[k]||[]).map(n=>n===old?next:n); return cp;});
    setPaid(prev=>{const cp={...prev}; if(cp[old]) cp[next]=cp[old]; delete cp[old]; return cp;});
    if(SB && viewDate==="LIVE"){
      try{
        const team=Object.keys(teams).find(t=>(teams[t]||[]).includes(old))||null;
        await sbUpsertPlayer({full_name:next,team,paid:!!paid[old],payment_method:paid[old]||null});
        await sbDeletePlayer(old);
      }catch(e){ setConn("local"); setConnErr(String(e?.message||e)); }
    }
    setShowEditModal(false); setEditTarget(null);
  };

  const setPayment=(name,method)=>{
    setPaid(prev=>{const cp={...prev}; if(method) cp[name]=method; else delete cp[name]; return cp;});
    if(SB && viewDate==="LIVE"){
      const team=Object.keys(teams).find(t=>(teams[t]||[]).includes(name))||null;
      sbUpsertPlayer({full_name:name,team,paid:!!method,payment_method:method||null}).catch(e=>{setConn("local"); setConnErr(String(e?.message||e));});
    }
    setShowPayModal(false); setPayTarget(null);
  };

  const deletePlayer=()=>{
    const n=deleteTarget; if(!n){setShowDeleteModal(false);return;}
    setIndividuals(p=>p.filter(x=>x!==n));
    setAddedSeq(seq=>seq.filter(x=>x!==n));
    setTeams(prev=>{const cp={}; for(const k in prev) cp[k]=(prev[k]||[]).filter(x=>x!==n); return cp;});
    setPaid(prev=>{const cp={...prev}; delete cp[n]; return cp;});
    if(SB && viewDate==="LIVE") sbDeletePlayer(n).catch(e=>{setConn("local"); setConnErr(String(e?.message||e));});
    setShowDeleteModal(false); setDeleteTarget(null);
  };

  // scores quick adjust
  const inc=(team,type,delta)=>{
    setScores(prev=>({...prev,[team]:nextScore(prev[team],type,delta)}));
    if(SB && viewDate==="LIVE"){
      const cur=scores[team]||{win:0,lose:0};
      const nv=type==="win"?{win:Math.max(0,cur.win+delta),lose:cur.lose}:{win:cur.win,lose:Math.max(0,cur.lose+delta)};
      sbUpsertScore(team,nv.win,nv.lose).catch(e=>{setConn("local"); setConnErr(String(e?.message||e));});
    }
  };

  // games
  const resetGameForm=()=>{setGTitle("");setGTeamA("");setGTeamB("");setGTime("");setGLoc("Gym 1");};
  const addGame=(e)=>{
    e.preventDefault();
    const row={title:(gTitle||"").trim()||`Game ${(games.length||0)+1}`,team_a:gTeamA,team_b:gTeamB,gdate:todayISO(),gtime:gTime||null,location:gLoc||"Gym 1",score_a:0,score_b:0};
    if(SB && viewDate==="LIVE"){ sbInsertGame(row).then(ins=>setGames(g=>[...g,{id:ins.id,...row}])).catch(()=>setGames(g=>[...g,{id:crypto.randomUUID?.()||String(Date.now()),...row}])); }
    else setGames(g=>[...g,{id:crypto.randomUUID?.()||String(Date.now()),...row}]);
    resetGameForm();
  };
  const requestEditGame=(g)=>{setEditGame({...g}); setShowGameEditModal(true);};
  const saveGameEdit=async()=>{
    const g=editGame; if(!g) return; const id=g.id;
    const old=games.find(x=>x.id===id)||{};
    const row={title:(g.title||"").trim()||"Game",team_a:g.team_a,team_b:g.team_b,gdate:g.gdate||null,gtime:g.gtime||null,location:g.location||null,score_a:Number(g.score_a)||0,score_b:Number(g.score_b)||0};
    const oldOc=getOutcome(old), newOc=getOutcome({...old,...row});
    const deltas=[];
    if(oldOc.type==="decided"&&newOc.type==="decided"&&(oldOc.winner!==newOc.winner||oldOc.loser!==newOc.loser)){
      deltas.push({team:oldOc.winner,type:"win",d:-1},{team:oldOc.loser,type:"lose",d:-1},{team:newOc.winner,type:"win",d:+1},{team:newOc.loser,type:"lose",d:+1});
    }else if(oldOc.type!=="decided"&&newOc.type==="decided"){
      deltas.push({team:newOc.winner,type:"win",d:+1},{team:newOc.loser,type:"lose",d:+1});
    }else if(oldOc.type==="decided"&&newOc.type!=="decided"){
      deltas.push({team:oldOc.winner,type:"win",d:-1},{team:oldOc.loser,type:"lose",d:-1});
    }
    if(deltas.length){
      setScores(prev=>{
        const cp={...prev};
        for(const x of deltas){
          const cur=cp[x.team]||{win:0,lose:0};
          cp[x.team]=x.type==="win"?{win:Math.max(0,cur.win+x.d),lose:cur.lose}:{win:cur.win,lose:Math.max(0,cur.lose+x.d)};
        }
        return cp;
      });
      if(SB && viewDate==="LIVE"){
        for(const x of deltas){
          const cur=scores[x.team]||{win:0,lose:0};
          const nv=x.type==="win"?{win:Math.max(0,cur.win+x.d),lose:cur.lose}:{win:cur.win,lose:Math.max(0,cur.lose+x.d)};
          try{ await sbUpsertScore(x.team,nv.win,nv.lose);}catch(e){setConn("local"); setConnErr(String(e?.message||e));}
        }
      }
    }
    setGames(list=>list.map(it=>it.id===id?{...it,...row}:it));
    if(SB && viewDate==="LIVE") sbUpdateGame(id,row).catch(e=>{setConn("local"); setConnErr(String(e?.message||e));});
    setShowGameEditModal(false); setEditGame(null);
  };
  const deleteGame=(id)=>{
    const g=games.find(x=>x.id===id);
    if(g){
      const oc=getOutcome(g);
      if(oc.type==="decided"){
        setScores(prev=>{
          const cp={...prev}; const w=cp[oc.winner]||{win:0,lose:0}; const l=cp[oc.loser]||{win:0,lose:0};
          cp[oc.winner]={win:Math.max(0,w.win-1),lose:w.lose}; cp[oc.loser]={win:l.win,lose:Math.max(0,l.lose-1)}; return cp;
        });
        if(SB && viewDate==="LIVE"){ const w=scores[oc.winner]||{win:0,lose:0}; const l=scores[oc.loser]||{win:0,lose:0};
          sbUpsertScore(oc.winner,Math.max(0,w.win-1),w.lose).catch(()=>{});
          sbUpsertScore(oc.loser,l.win,Math.max(0,l.lose-1)).catch(()=>{});
        }
      }
    }
    setGames(list=>list.filter(x=>x.id!==id));
    if(SB && viewDate==="LIVE") sbDeleteGame(id).catch(e=>{setConn("local"); setConnErr(String(e?.message||e));});
  };
  const clearAllGames=async()=>{
    if(SB && viewDate==="LIVE"){ try{ await sbDeleteAllGames(); }catch(e){ setConn("local"); setConnErr(String(e?.message||e)); } }
    setGames([]);
    const zeros=TEAMS.reduce((a,t)=>{a[t]={win:0,lose:0};return a;},{}); setScores(zeros);
    if(SB && viewDate==="LIVE"){ for(const t of TEAMS){ try{ await sbUpsertScore(t,0,0);}catch(e){setConn("local"); setConnErr(String(e?.message||e));} } }
  };

  /* ----- LOG actions ----- */
  const refreshAdminDates = useCallback(async ()=>{
    const dates = await adminListLogsMerged();
    setLogDates(dates);
  },[]);

  const saveLog = async () => {
    const dateStr = logDate || todayISO();
    const payload = makePayload();
    await sbSaveLog(dateStr, payload);
    await refreshAdminDates();
    alert(`Saved log for ${dateStr}`);
  };

  // broadcast to public
  const broadcastLogsCleared = async () => {
    try{
      const chan = SB.channel("logs-bus");
      await chan.subscribe();
      await chan.send({ type:"broadcast", event:"logs_cleared", payload:{ ts: Date.now() } });
      try{ SB.removeChannel(chan); }catch{}
    }catch{}
  };

  const doClearAdminOnly = async ()=>{
    setLocalLogs({});
    try { localStorage.setItem(LS_LOGS_BUMP, String(Date.now())); } catch {}
    await refreshAdminDates();
  };
  const doClearPublicOnly = async ()=>{
    const ok = await sbClearLogs();
    if(ok){
      await broadcastLogsCleared();
      await refreshAdminDates();
    } else {
      alert("DB refused to clear logs. Check console for error from [sbClearLogs].");
    }
  };
  const doClearBoth = async ()=>{
    await doClearPublicOnly();
    await doClearAdminOnly();
    if(viewDate!=="LIVE"){
      setViewDate("LIVE");
      const snap=getLocal(); if(snap) applyPayload(snap);
    }
  };

  const loadLogDate = async (d) => {
    if(d==="LIVE"){ setViewDate("LIVE"); const snap=getLocal(); if(snap) applyPayload(snap); return; }
    const p = await sbGetLog(d);
    if(!p){ alert("No data for that date"); return; }
    applyPayload(p);
    setViewDate(d);
  };

  /* NEW: "New" — wipe all inputs (players, teams, paid, scores, games) */
  const newBlank = async () => {
    if(!confirm("Start a NEW blank league? This clears players, teams, games, and scores.")) return;

    // local state reset
    setIndividuals([]);
    setAddedSeq([]);
    setTeams(EMPTY_TEAMS);
    setPaid({});
    setScores(TEAMS.reduce((a,t)=>{a[t]={win:0,lose:0};return a;},{}));
    setGames([]);

    // persist locally for LIVE
    if(viewDate==="LIVE") setLocal(makeLocal({}));

    // also clear remote when online + LIVE
    if(SB && viewDate==="LIVE"){
      try { await sbDeleteAllPlayers(); } catch(e){ setConn("local"); setConnErr(String(e?.message||e)); }
      try { await sbDeleteAllGames(); } catch(e){ setConn("local"); setConnErr(String(e?.message||e)); }
      for(const t of TEAMS){
        try { await sbUpsertScore(t,0,0); } catch(e){ setConn("local"); setConnErr(String(e?.message||e)); }
      }
    }
  };

  /* SORTED views */
  const sortedIndividuals=useMemo(()=>{
    if(sortMode==="alpha"){
      return [...individuals].sort((a,b)=>{
        const A=parseStoredName(a).baseWithJersey.toLowerCase();
        const B=parseStoredName(b).baseWithJersey.toLowerCase();
        return A.localeCompare(B);
      });
    }
    const inSeq = addedSeq.filter(n=>individuals.includes(n));
    const leftovers = individuals.filter(n=>!addedSeq.includes(n));
    return [...inSeq, ...leftovers]; // newest last
  },[individuals,addedSeq,sortMode]);

  const [openSort,setOpenSort]=useState(false); const sortRef=useRef(null);
  useEffect(()=>{const onDoc=(e)=>{if(sortRef.current&&!sortRef.current.contains(e.target)) setOpenSort(false);}; document.addEventListener("click",onDoc); return()=>document.removeEventListener("click",onDoc);},[]);

  const publicUrl=`${location.origin}${location.pathname}?public=1`;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 md:p-8">
      <div className="mx-auto w-full max-w-6xl">
        {/* top bar */}
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className={`inline-block px-2 py-1 rounded text-xs ${conn==="online"?"bg-green-100 text-green-700":conn==="checking"?"bg-yellow-100 text-yellow-800":"bg-gray-200 text-gray-700"}`}>
              {conn==="online"?"Supabase connected":conn==="checking"?"Checking…":"Local mode (not syncing)"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a className="text-sm h-9 px-3 rounded-xl border hover:bg-slate-50 inline-flex items-center" href={publicUrl} target="_blank" rel="noreferrer">Open Public Link</a>
          </div>
        </div>

        {conn!=="online"&&connErr && <div className="mb-4 text-sm bg-yellow-50 border border-yellow-200 text-yellow-800 rounded p-2">{connErr}</div>}

        {/* Logs toolbar */}
        <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-5 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Log Viewer:</span>
              <select className="border rounded-xl h-10 px-3"
                value={viewDate}
                onChange={e=>loadLogDate(e.target.value)}>
                <option value="LIVE">LIVE (current)</option>
                {logDates.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
              {/* NEW button */}
              <button
                className="h-10 px-4 rounded-xl border text-slate-700 hover:bg-slate-50"
                onClick={newBlank}
                title="Start a fresh blank league"
                disabled={viewDate!=="LIVE"}
              >
                New
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input type="date" className="border rounded-xl h-10 px-3" value={logDate} onChange={e=>setLogDate(e.target.value)}/>
              <button className="h-10 px-4 rounded-xl bg-blue-600 text-white" onClick={saveLog}>Save Log</button>
              <button className="h-10 px-4 rounded-xl border border-rose-300 text-rose-700 hover:bg-rose-50" onClick={()=>{setClearPwd(""); setShowClearLogsModal(true);}}>Clear Logs…</button>
            </div>
          </div>
        </div>

        {/* header + add */}
        <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold">
              Perpetual Alumni
              <span className="ml-3 align-middle text-sm font-semibold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">
                {individuals.length} {individuals.length===1?"Player":"Players"}
              </span>
              {viewDate!=="LIVE" && <span className="ml-2 text-xs px-2 py-1 rounded bg-slate-100 text-slate-700">{viewDate} (log)</span>}
            </h1>
          </div>
          <form onSubmit={addPlayer} className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
            <input className="border rounded-xl px-3 py-2 h-11 md:col-span-2" placeholder="Full name" value={newName} onChange={e=>setNewName(e.target.value)} disabled={viewDate!=="LIVE"}/>
            <input className="border rounded-xl px-3 py-2 h-11" placeholder="Jersey #" inputMode="numeric" value={newJersey} onChange={e=>setNewJersey(e.target.value)} disabled={viewDate!=="LIVE"}/>
            <select className="border rounded-xl px-3 py-2 h-11" value={newPos} onChange={e=>setNewPos(e.target.value)} disabled={viewDate!=="LIVE"}>
              <option value="">Position</option><option>PG</option><option>SG</option><option>SF</option><option>PF</option><option>C</option>
            </select>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={newCaptain} onChange={e=>setNewCaptain(e.target.checked)} disabled={viewDate!=="LIVE"}/>Captain</label>
              <button className="ml-auto h-11 px-5 rounded-xl bg-blue-600 text-white" disabled={viewDate!=="LIVE"}>Add</button>
            </div>
          </form>
        </div>

        {/* players */}
        <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6 mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg sm:text-xl font-semibold">Players</h3>
            <SortDropdown sortMode={sortMode} setSortMode={setSortMode}/>
          </div>

          <ol className="space-y-2 list-decimal list-inside">
            {sortedIndividuals.map(stored=>{
              const assigned=Object.keys(teams).find(t=>teams[t].includes(stored))||"";
              const method=paid[stored];
              const badge=method==="gcash"?"text-blue-700 bg-blue-100":"text-green-700 bg-green-100";
              return (
                <li key={stored} className={"rounded px-2 py-1 "+(flash===stored?"bg-yellow-50 ring-1 ring-yellow-200":"")}>
                  <div className="inline-flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <span className="flex-1 font-medium">
                      <NameWithCaptain name={stored}/>
                      {method && <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${badge}`}>Paid ({method==="cash"?"Cash":"GCash"})</span>}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <select className="border rounded-lg px-2 py-2 h-9" value={assigned} onChange={e=>assignTeam(stored,e.target.value)} disabled={viewDate!=="LIVE"}>
                        <option value="">No Team</option>{TEAMS.map(t=><option key={t} value={t}>Team {t}</option>)}
                      </select>
                      <button onClick={()=>{setPayTarget(stored); setShowPayModal(true);}} className={`h-9 px-3 rounded-lg text-white ${method?"bg-green-700":"bg-green-500"}`} disabled={viewDate!=="LIVE"}>{method?"Change Paid":"Paid"}</button>
                      <button onClick={()=>openEdit(stored)} className="h-9 px-3 rounded-lg bg-yellow-500 text-white" disabled={viewDate!=="LIVE"}>Edit</button>
                      <button onClick={()=>{setDeleteTarget(stored); setShowDeleteModal(true);}} className="h-9 px-3 rounded-lg bg-red-500 text-white" disabled={viewDate!=="LIVE"}>Delete</button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* schedule */}
        <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg sm:text-xl font-semibold">Game Schedule</h3>
            <button onClick={clearAllGames} className="h-10 px-4 rounded-xl border text-rose-700 border-rose-300 hover:bg-rose-50" disabled={viewDate!=="LIVE"}>Clear All Games</button>
          </div>
          <form onSubmit={addGame} className="grid grid-cols-1 md:grid-cols-8 gap-2 md:gap-3 mb-4">
            <input className="border rounded-2xl px-3 py-2 h-11 md:col-span-2" placeholder={`Title (e.g., Game ${games.length+1})`} value={gTitle} onChange={e=>setGTitle(e.target.value)} disabled={viewDate!=="LIVE"}/>
            <select className="border rounded-2xl px-3 py-2 h-11" value={gTeamA} onChange={e=>setGTeamA(e.target.value)} disabled={viewDate!=="LIVE"}><option value="">-------</option>{TEAMS.map(t=><option key={t} value={t}>Team {t}</option>)}</select>
            <select className="border rounded-2xl px-3 py-2 h-11" value={gTeamB} onChange={e=>setGTeamB(e.target.value)} disabled={viewDate!=="LIVE"}><option value="">-------</option>{TEAMS.map(t=><option key={t} value={t}>Team {t}</option>)}</select>
            <input className="border rounded-2xl px-3 py-2 h-11" type="time" value={gTime} onChange={e=>setGTime(e.target.value)} disabled={viewDate!=="LIVE"}/>
            <select className="border rounded-2xl px-3 py-2 h-11" value={gLoc} onChange={e=>setGLoc(e.target.value)} disabled={viewDate!=="LIVE"}><option>Gym 1</option><option>Gym 2</option></select>
            <button className="h-11 px-5 rounded-2xl bg-blue-600 text-white md:col-span-2" disabled={viewDate!=="LIVE"}>Create Match</button>
          </form>

          <div className="space-y-3">
            {games.length===0 ? <div className="text-gray-500 text-sm">No games yet. Create one above.</div> : games.map((g,idx)=>{
              const a=g.team_a?.trim(), b=g.team_b?.trim(); const w=winnerLabel(g);
              return (
                <div key={g.id} className="border rounded-2xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
                    <div className="font-semibold min-w-24">{g.title||`Game ${idx+1}`}</div>
                    <div className="text-sm text-gray-700 flex-1">
                      {(a||b)?<span>Team {a||"?"} vs Team {b||"?"}</span>:<span className="text-gray-400">Unassigned teams</span>}
                      <span className="ml-3">{fmtMDY(g.gdate)}{g.gtime?` ${g.gtime}`:""}</span>
                      {g.location?<span className="ml-3">• {g.location}</span>:null}
                    </div>
                    <div className="hidden sm:flex items-center gap-2">
                      <span className="px-2 py-1 rounded bg-slate-100 text-sm">Score: {g.score_a} — {g.score_b}</span>
                      <span className={`px-2 py-1 rounded text-xs ${w.startsWith("Team")?"bg-emerald-100 text-emerald-700":"bg-slate-100 text-slate-700"}`}>Winner: {w}</span>
                      <button className="h-9 px-3 rounded-lg bg-yellow-500 text-white" onClick={()=>requestEditGame(g)} disabled={viewDate!=="LIVE"}>Edit</button>
                      <button className="h-9 px-3 rounded-lg bg-red-500 text-white" onClick={()=>deleteGame(g.id)} disabled={viewDate!=="LIVE"}>Delete</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* teams */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {TEAMS.map(t=>{
            const W=scores[t]?.win??0, L=scores[t]?.lose??0;
            return (
              <section key={t} className="bg-white rounded-2xl shadow-sm border p-4 sm:p-5">
                <h2 className="text-lg sm:text-xl font-semibold mb-3">
                  Team {t}
                  <span className="ml-3 text-sm font-normal">(<span className="text-green-600">Win {W}</span> / <span className="text-red-600">Lose {L}</span>)</span>
                </h2>
                <ul className="space-y-2">
                  {(teams[t]||[]).length ? (teams[t]||[]).map((n,i)=>
                    <li key={n} className="flex items-center gap-2">
                      <span className="font-medium w-6 text-right">{i+1}.</span>
                      <span className="flex-1"><NameWithCaptain name={n}/></span>
                      <button onClick={()=>assignTeam(n,"")} className="h-9 px-3 rounded-lg bg-red-500 text-white" disabled={viewDate!=="LIVE"}>Remove</button>
                    </li>
                  ) : <li className="text-gray-400">No players</li>}
                </ul>
              </section>
            );
          })}
        </div>

        {/* footer */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
          <button onClick={()=>setShowClearModal(true)} className="h-10 px-5 rounded-xl border text-red-700 border-red-300 hover:bg-red-50" disabled={viewDate!=="LIVE"}>Clear All Players</button>
          <button onClick={()=>setShowClearLogsModal(true)} className="h-10 px-5 rounded-xl border border-rose-300 text-rose-700">Clear Logs…</button>
          <button onClick={()=>setShowLogoutModal(true)} className="h-10 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white">Logout</button>
        </div>
      </div>

      {/* Modals */}
      {showDeleteModal && (
        <Modal onClose={()=>{setShowDeleteModal(false); setDeleteTarget(null);}}>
          <h4 className="text-lg font-semibold mb-2">Delete player?</h4>
          <p className="text-sm text-gray-600 mb-4">Remove <span className="font-medium">{deleteTarget}</span>.</p>
          <div className="flex justify-end gap-2">
            <button className="h-10 px-4 rounded-lg border" onClick={()=>{setShowDeleteModal(false); setDeleteTarget(null);}}>Cancel</button>
            <button className="h-10 px-4 rounded-lg bg-red-600 text-white" onClick={deletePlayer} disabled={viewDate!=="LIVE"}>Delete</button>
          </div>
        </Modal>
      )}
      {showPayModal && (
        <Modal onClose={()=>{setShowPayModal(false); setPayTarget(null);}}>
          <h4 className="text-lg font-semibold mb-3">Set Payment for</h4>
          <div className="mb-4 font-medium">{payTarget}</div>
          <div className="grid gap-2">
            <button onClick={()=>setPayment(payTarget,"cash")} className="h-11 rounded-lg bg-green-600 text-white" disabled={viewDate!=="LIVE"}>Cash</button>
            <button onClick={()=>setPayment(payTarget,"gcash")} className="h-11 rounded-lg bg-sky-600 text-white" disabled={viewDate!=="LIVE"}>GCash</button>
            <button onClick={()=>setPayment(payTarget,null)} className="h-11 rounded-lg border" disabled={viewDate!=="LIVE"}>Clear / Unpaid</button>
          </div>
          <div className="text-right mt-3"><button className="h-9 px-3 rounded-lg border" onClick={()=>{setShowPayModal(false); setPayTarget(null);}}>Close</button></div>
        </Modal>
      )}
      {showClearModal && (
        <Modal onClose={()=>setShowClearModal(false)}>
          <h4 className="text-lg font-semibold mb-3">Clear ALL registered players?</h4>
          <div className="flex justify-end gap-2">
            <button className="h-10 px-4 rounded-lg border" onClick={()=>setShowClearModal(false)}>Cancel</button>
            <button className="h-10 px-4 rounded-lg bg-red-600 text-white" onClick={()=>{
              if(SB && viewDate==="LIVE") sbDeleteAllPlayers().catch(e=>{setConn("local"); setConnErr(String(e?.message||e));});
              setIndividuals([]); setAddedSeq([]); setTeams(EMPTY_TEAMS); setPaid({});
              setShowClearModal(false);
            }} disabled={viewDate!=="LIVE"}>Clear All</button>
          </div>
        </Modal>
      )}
      {showLogoutModal && (
        <Modal onClose={()=>setShowLogoutModal(false)}>
          <h4 className="text-lg font-semibold mb-3">Log out?</h4>
          <div className="flex justify-end gap-2">
            <button className="h-10 px-4 rounded-lg border" onClick={()=>setShowLogoutModal(false)}>Cancel</button>
            <button className="h-10 px-4 rounded-lg bg-rose-600 text-white" onClick={onLogout}>Logout</button>
          </div>
        </Modal>
      )}
      {showEditModal && (
        <Modal onClose={()=>{setShowEditModal(false); setEditTarget(null);}}>
          <h4 className="text-lg font-semibold mb-3">Edit Player</h4>
          <div className="grid gap-3">
            <input className="border rounded-lg px-3 py-2 h-11" placeholder="Full name" value={editBase} onChange={e=>setEditBase(e.target.value)} disabled={viewDate!=="LIVE"}/>
            <input className="border rounded-lg px-3 py-2 h-11" placeholder="Jersey #" value={editJersey} onChange={e=>setEditJersey(e.target.value)} disabled={viewDate!=="LIVE"}/>
            <select className="border rounded-lg px-3 py-2 h-11" value={editPos} onChange={e=>setEditPos(e.target.value)} disabled={viewDate!=="LIVE"}><option value="">Position</option><option>PG</option><option>SG</option><option>SF</option><option>PF</option><option>C</option></select>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={editCaptain} onChange={e=>setEditCaptain(e.target.checked)} disabled={viewDate!=="LIVE"}/>Captain</label>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button className="h-10 px-4 rounded-lg border" onClick={()=>{setShowEditModal(false); setEditTarget(null);}}>Cancel</button>
            <button className="h-10 px-4 rounded-lg bg-blue-600 text-white" onClick={saveEdit} disabled={viewDate!=="LIVE"}>Save</button>
          </div>
        </Modal>
      )}
      {showGameEditModal && editGame && (
        <Modal onClose={()=>{setShowGameEditModal(false); setEditGame(null);}}>
          <h4 className="text-lg font-semibold mb-4">Edit Game (Scores / Date / Time / Gym)</h4>
          <div className="space-y-4">
            <fieldset className="border rounded-xl p-4">
              <legend className="px-1 text-sm font-semibold text-gray-700">Game Details</legend>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input className="border rounded-lg px-3 py-2 h-11" placeholder="Title" value={editGame.title||""} onChange={e=>setEditGame({...editGame,title:e.target.value})} disabled={viewDate!=="LIVE"}/>
                <input className="border rounded-lg px-3 py-2 h-11" type="date" value={editGame.gdate||""} onChange={e=>setEditGame({...editGame,gdate:e.target.value})} disabled={viewDate!=="LIVE"}/>
                <input className="border rounded-lg px-3 py-2 h-11" type="time" value={editGame.gtime||""} onChange={e=>setEditGame({...editGame,gtime:e.target.value})} disabled={viewDate!=="LIVE"}/>
                <select className="border rounded-lg px-3 py-2 h-11" value={editGame.location||"Gym 1"} onChange={e=>setEditGame({...editGame,location:e.target.value})} disabled={viewDate!=="LIVE"}><option>Gym 1</option><option>Gym 2</option></select>
              </div>
            </fieldset>
            <fieldset className="border rounded-xl p-4">
              <legend className="px-1 text-sm font-semibold text-gray-700">Teams &amp; Scores</legend>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select className="border rounded-lg px-3 py-2 h-11" value={editGame.team_a||""} onChange={e=>setEditGame({...editGame,team_a:e.target.value})} disabled={viewDate!=="LIVE"}><option value="">-------</option>{TEAMS.map(t=><option key={t} value={t}>Team {t}</option>)}</select>
                <select className="border rounded-lg px-3 py-2 h-11" value={editGame.team_b||""} onChange={e=>setEditGame({...editGame,team_b:e.target.value})} disabled={viewDate!=="LIVE"}><option value="">-------</option>{TEAMS.map(t=><option key={t} value={t}>Team {t}</option>)}</select>
                <input className="border rounded-lg px-3 py-2 h-11" type="number" min="0" value={editGame.score_a??0} onChange={e=>setEditGame({...editGame,score_a:e.target.value})} disabled={viewDate!=="LIVE"}/>
                <input className="border rounded-lg px-3 py-2 h-11" type="number" min="0" value={editGame.score_b??0} onChange={e=>setEditGame({...editGame,score_b:e.target.value})} disabled={viewDate!=="LIVE"}/>
              </div>
            </fieldset>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button className="h-10 px-4 rounded-lg border" onClick={()=>{setShowGameEditModal(false); setEditGame(null);}}>Cancel</button>
            <button className="h-10 px-4 rounded-lg bg-blue-600 text-white" onClick={saveGameEdit} disabled={viewDate!=="LIVE"}>Save</button>
          </div>
        </Modal>
      )}
      {showClearLogsModal && (
        <Modal onClose={()=>setShowClearLogsModal(false)}>
          <h4 className="text-lg font-semibold mb-3">Clear Logs</h4>
          <div className="text-sm text-gray-600 mb-2">Enter password to enable options.</div>
          <input
            type="password"
            className="w-full h-11 border rounded-lg px-3 mb-3"
            placeholder="Password (1234)"
            value={clearPwd}
            onChange={(e)=>setClearPwd(e.target.value)}
          />
          <div className="grid gap-2">
            <button
              className="h-11 rounded-lg bg-green-600 text-white disabled:opacity-50"
              disabled={clearPwd!=="1234"}
              onClick={async ()=>{
                await (async()=>{ setLocalLogs({}); try { localStorage.setItem(LS_LOGS_BUMP, String(Date.now())); } catch {} await refreshAdminDates(); })();
                setShowClearLogsModal(false);
                alert("Cleared admin logs only.");
              }}>
              Admin only
            </button>
            <button
              className="h-11 rounded-lg bg-sky-600 text-white disabled:opacity-50"
              disabled={clearPwd!=="1234"}
              onClick={async ()=>{
                const ok = await sbClearLogs();
                if(ok){ 
                  try{ const chan=SB.channel("logs-bus"); await chan.subscribe(); await chan.send({type:"broadcast",event:"logs_cleared",payload:{ts:Date.now()}}); try{SB.removeChannel(chan);}catch{} }catch{}
                  await refreshAdminDates();
                }
                setShowClearLogsModal(false);
                alert("Cleared public logs only.");
              }}>
              Public only
            </button>
            <button
              className="h-11 rounded-lg border disabled:opacity-50"
              disabled={clearPwd!=="1234"}
              onClick={async ()=>{
                const ok = await sbClearLogs();
                if(ok){ try{ const chan=SB.channel("logs-bus"); await chan.subscribe(); await chan.send({type:"broadcast",event:"logs_cleared",payload:{ts:Date.now()}}); try{SB.removeChannel(chan);}catch{} }catch{} }
                setLocalLogs({});
                try { localStorage.setItem(LS_LOGS_BUMP, String(Date.now())); } catch {}
                await refreshAdminDates();
                if(viewDate!=="LIVE"){ setViewDate("LIVE"); const snap=getLocal(); if(snap) applyPayload(snap); }
                setShowClearLogsModal(false);
                alert("Cleared admin and public logs.");
              }}>
              Clear BOTH (admin + public)
            </button>
          </div>
          <div className="text-right mt-3">
            <button className="h-9 px-3 rounded-lg border" onClick={()=>setShowClearLogsModal(false)}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* small component: sort dropdown */
function SortDropdown({sortMode,setSortMode}){
  const [open,setOpen]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{const h=(e)=>{if(ref.current && !ref.current.contains(e.target)) setOpen(false)}; document.addEventListener("click",h); return ()=>document.removeEventListener("click",h);},[]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={()=>setOpen(v=>!v)} className="inline-flex items-center gap-2 px-3 h-10 rounded-xl border bg-white hover:bg-slate-50">
        {sortMode==="alpha"?"Alphabetical (A–Z)":"Most Recent"} ▾
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl border bg-white shadow-lg z-10">
          <button className={`block w-full text-left px-4 py-2 hover:bg-slate-50 ${sortMode==="recent"?"font-semibold":""}`} onClick={()=>{setSortMode("recent"); setOpen(false);}}>Most Recent (newest at bottom)</button>
          <button className={`block w-full text-left px-4 py-2 hover:bg-slate-50 ${sortMode==="alpha"?"font-semibold":""}`} onClick={()=>{setSortMode("alpha"); setOpen(false);}}>Alphabetical (A–Z)</button>
        </div>
      )}
    </div>
  );
}

/* ============================== Public View ============================== */
function FitToPage({designWidth=1280,children}){
  const [scale,setScale]=useState(1);
  const recompute=useCallback(()=>{const vw=Math.max(document.documentElement.clientWidth,window.innerWidth||0); setScale(Math.min(1,vw/designWidth));},[designWidth]);
  useEffect(()=>{recompute(); const r=()=>recompute(); window.addEventListener("resize",r,{passive:true}); window.addEventListener("orientationchange",r,{passive:true}); return()=>{window.removeEventListener("resize",r); window.removeEventListener("orientationchange",r);};},[recompute]);
  return (<div className="w-screen min-h-screen bg-slate-50 overflow-x-hidden" style={{WebkitTextSizeAdjust:"100%"}}><div className="mx-auto" style={{width:designWidth,transform:`scale(${scale})`,transformOrigin:"top left"}}>{children}</div><div style={{height:`${(1-scale)*100}vh`}}/></div>);
}
function PublicBoard(){
  const [loading,setLoading]=useState(true),[err,setErr]=useState("");
  const [payload,setPayload]=useState(null);
  const [logDates,setLogDates]=useState([]);
  const [viewDate,setViewDate]=useState("LIVE");

  const refreshLogs = useCallback(async ()=>{
    const dates=await sbListLogs();
    setLogDates(dates);
    if(dates.length===0 || (viewDate!=="LIVE" && !dates.includes(viewDate))){
      setViewDate("LIVE");
      const live=getLocal(); if(live) setPayload(live);
      setLocalLogs({});
    }
  },[viewDate]);

  useEffect(()=>{(async()=>{
    try{
      if(!SB) throw new Error("Supabase not initialized");
      const d=await sbFetchAll();
      const ps=d.players||[]; const players=ps.map(p=>p.full_name);
      const t=TEAMS.reduce((a,k)=>{a[k]=[];return a;},{}); ps.forEach(p=>{if(p.team&&t[p.team]) t[p.team].push(p.full_name)});
      const sc=TEAMS.reduce((a,k)=>{a[k]={win:0,lose:0};return a;},{}); (d.scores||[]).forEach(r=>{if(sc[r.team]) sc[r.team]={win:r.wins||0,lose:r.losses||0};});
      const games=(d.games||[]).map(g=>({id:g.id,title:g.title||"",team_a:g.team_a||"",team_b:g.team_b||"",gdate:g.gdate||"",gtime:g.gtime||"",location:g.location||"",score_a:Number.isFinite(g.score_a)?g.score_a:0,score_b:Number.isFinite(g.score_b)?g.score_b:0}));
      setPayload({individuals:players,addedSeq:players,teams:t,paid:{},scores:sc,games,sortMode:"recent"});
    }catch(e){
      setErr(String(e?.message||e));
      const local=getLocal(); if(local) setPayload(local);
    }finally{
      await refreshLogs();
      setLoading(false);
    }
  })();},[refreshLogs]);

  useEffect(()=>{
    if(!SB) return;
    const ch = SB.channel("logs-watch")
      .on("postgres_changes",{event:"*",schema:"public",table:"league_logs"},async ()=>{ await refreshLogs(); })
      .subscribe();
    return ()=>{ try{SB.removeChannel(ch);}catch{} };
  },[refreshLogs]);

  useEffect(()=>{
    if(!SB) return;
    const bus = SB.channel("logs-bus")
      .on("broadcast",{event:"logs_cleared"}, async ()=>{
        setLocalLogs({});
        await refreshLogs();
      })
      .subscribe();
    return ()=>{ try{SB.removeChannel(bus);}catch{} };
  },[refreshLogs]);

  useEffect(()=>{
    const onStorage=(e)=>{
      if(e.key===LS_LOGS || e.key===LS_LOGS_BUMP){
        refreshLogs();
      }
    };
    window.addEventListener("storage", onStorage);
    return ()=>window.removeEventListener("storage", onStorage);
  },[refreshLogs]);

  useEffect(()=>{
    const id=setInterval(()=>{ refreshLogs(); }, 10000);
    return ()=>clearInterval(id);
  },[refreshLogs]);

  const loadView = async (d)=>{
    if(d==="LIVE"){ setViewDate("LIVE"); const live=getLocal(); if(live) setPayload(live); return; }
    const p=await sbGetLog(d);
    if(p){ setPayload(p); setViewDate(d); }
  };

  if(!payload) return <div className="p-6 text-center">Loading…</div>;

  const players = payload.individuals||[];
  const teams   = payload.teams||EMPTY_TEAMS;
  const scores  = payload.scores||{};
  const games   = payload.games||[];

  const chunk=(a,n)=>{const out=[]; for(let i=0;i<a.length;i+=n) out.push(a.slice(i,i+n)); return out;};
  const nonEmpty=TEAMS.filter(t=>(teams[t]||[]).length>0);

  const content=(
    <div className="p-4 sm:p-6 md:p-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold">League Summary
            <span className="ml-3 text-sm font-semibold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">{players.length} {players.length===1?"Player":"Players"}</span>
          </h1>
          {logDates.length>0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm">Log:</span>
              <select className="border rounded-xl h-9 px-3" value={viewDate} onChange={e=>loadView(e.target.value)}>
                <option value="LIVE">LIVE (current)</option>
                {logDates.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
        </div>
        {loading && <div className="text-gray-500">Loading…</div>}
        {!loading && err && <div className="mb-4 text-sm bg-yellow-50 border border-yellow-200 text-yellow-800 rounded p-2">{err}</div>}

        <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6 mb-6">
          <h3 className="text-lg sm:text-xl font-semibold mb-3">Game Schedule</h3>
          {games.length===0?<div className="text-gray-500 text-sm">No games scheduled.</div>:
            <div className="space-y-3">
              {games.map((g,idx)=>{
                const a=g.team_a?.trim(), b=g.team_b?.trim();
                const rosterA=(teams[a]||[]), rosterB=(teams[b]||[]);
                const w=winnerLabel(g);
                return (
                  <div key={g.id||idx} className="border rounded-2xl p-4">
                    <div className="flex flex-row items-center gap-3 mb-2">
                      <div className="font-semibold min-w-24">{g.title||`Game ${idx+1}`}</div>
                      <div className="text-sm text-gray-700 flex-1">
                        {(a||b)?<span>Team {a||"?"} vs Team {b||"?"}</span>:<span className="text-gray-400">Unassigned teams</span>}
                        <span className="ml-3">{fmtMDY(g.gdate)}{g.gtime?` ${g.gtime}`:""}</span>
                        {g.location && <span className="ml-3">• {g.location}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 rounded bg-slate-100 text-sm">Score: {g.score_a} — {g.score_b}</span>
                        <span className={`px-2 py-1 rounded text-xs ${winnerLabel(g).startsWith("Team")?"bg-emerald-100 text-emerald-700":"bg-slate-100 text-slate-700"}`}>Winner: {winnerLabel(g)}</span>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="font-semibold text-sm mb-1">Team {a||"?"} Roster</div>
                        {rosterA.length?<ul className="list-disc list-inside space-y-1 text-sm">{rosterA.map(n=><li key={`ra-${g.id}-${n}`}><NameWithCaptain name={n}/></li>)}</ul>:<div className="text-gray-400 text-sm">No players</div>}
                      </div>
                      <div>
                        <div className="font-semibold text-sm mb-1">Team {b||"?"} Roster</div>
                        {rosterB.length?<ul className="list-disc list-inside space-y-1 text-sm">{rosterB.map(n=><li key={`rb-${g.id}-${n}`}><NameWithCaptain name={n}/></li>)}</ul>:<div className="text-gray-400 text-sm">No players</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>}
        </div>

        {nonEmpty.length>0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            {nonEmpty.map(t=>{
              const roster=teams[t]||[]; const W=scores[t]?.win??0, L=scores[t]?.lose??0;
              return (
                <section key={t} className="bg-white rounded-2xl shadow-sm border p-5">
                  <h2 className="text-xl font-semibold mb-3">Team {t}
                    <span className="ml-3 text-sm font-normal">(<span className="text-green-600">Win {W}</span> / <span className="text-red-600">Lose {L}</span>)</span>
                  </h2>
                  <ul className="space-y-2">{roster.map(n=><li key={n}><NameWithCaptain name={n}/></li>)}</ul>
                </section>
              );
            })}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border p-5">
          <h3 className="text-lg sm:text-xl font-semibold mb-3">Players</h3>
          {players.length===0?<div className="text-gray-500 text-sm">No registered players.</div>:
            <div className="overflow-x-auto">
              <div className="grid grid-flow-col auto-cols-max gap-8">
                {chunk(players,10).map((col,idx)=>(
                  <ol key={idx} start={idx*10+1} className="list-decimal pl-6 space-y-1 min-w-[220px]">
                    {col.map((n,i)=><li key={`${n}-${i}`} className="text-sm"><NameWithCaptain name={n}/></li>)}
                  </ol>
                ))}
              </div>
            </div>}
        </div>

        <div className="mt-6 text-center text-sm text-gray-500">Public view</div>
      </div>
    </div>
  );
  return <FitToPage designWidth={1280}>{content}</FitToPage>;
}

/* =============================== Modal ================================= */
function Modal({children,onClose}){
  return (
    <div className="fixed inset-0 z-50 grid place-items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-xl p-6 w-[92%] max-w-2xl">{children}</div>
    </div>
  );
}

/* ================================= App ================================= */
export default function App(){
  const isPublic=typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("public")==="1";
  const {user,login,logout}=useAuth();
  if(isPublic) return <PublicBoard/>;
  return user?<League onLogout={logout}/>:<Login onLogin={login}/>;
}
