// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";

/* ----------------- auth (cookie + localStorage) ----------------- */
function setCookie(n,v,d=365){try{document.cookie=`${n}=${encodeURIComponent(v)}; Expires=${new Date(Date.now()+d*864e5).toUTCString()}; Path=/; SameSite=Lax`;}catch{}}
function getCookie(n){try{const m=document.cookie.match(new RegExp("(^| )"+n+"=([^;]+)"));return m?decodeURIComponent(m[2]):null;}catch{return null}}
function delCookie(n){try{document.cookie=`${n}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`;}catch{}}
function useAuthUser(){
  const [user,setUser]=useState(()=>getCookie("auth_user")||localStorage.getItem("auth_user")||null);
  const login =(name)=>{try{localStorage.setItem("auth_user",name);}catch{}; setCookie("auth_user",name); setUser(name);};
  const logout=()=>{try{localStorage.removeItem("auth_user");}catch{}; delCookie("auth_user"); setUser(null);};
  useEffect(()=>{const onStorage=e=>{if(e.key==="auth_user") setUser(e.newValue)}; window.addEventListener("storage",onStorage); return()=>window.removeEventListener("storage",onStorage)},[]);
  return {user,login,logout};
}

/* ----------------- local snapshot (refresh safe) ----------------- */
const LS_KEY="paml:v3";
const loadLocal =()=>{try{const s=localStorage.getItem(LS_KEY);return s?JSON.parse(s):null;}catch{return null}};
const saveLocal =(state)=>{try{localStorage.setItem(LS_KEY,JSON.stringify(state));}catch{}};

/* ----------------------------- helpers ---------------------------- */
const TEAMS=["A","B","C","D","E","F","G","H","I","J"];
const emptyTeams=TEAMS.reduce((a,t)=>{a[t]=[];return a;},{});
const nextScore=(prev,type,delta)=>({ ...prev, [type]: Math.max(0, Number(prev?.[type]??0)+Number(delta||0)) });
const safeLogo=(envUrl,globalUrl)=>globalUrl||envUrl||"/sports_logo.jpg";

/* --------------------------- demo creds --------------------------- */
let storedUsername="Admin";
let storedPassword="@lum2025!";

/* ---------------------- supabase convenience --------------------- */
const sb = typeof window !== "undefined" ? window.sb : undefined;

async function sbFetchAll(){
  if(!sb) return null;
  const [{data:players, error:e1},{data:scores, error:e2}] = await Promise.all([
    sb.from("players").select("full_name,team,paid").order("full_name",{ascending:true}),
    sb.from("team_scores").select("team,wins,losses"),
  ]);
  if (e1 || e2) throw e1 || e2;
  return {players:players||[], scores:scores||[]};
}
async function sbBulkUpsert(local){
  if(!sb) return;
  const playerRows = (local.individuals||[]).map(n=>({
    full_name:n,
    team:Object.keys(local.teams||{}).find(t=>(local.teams[t]||[]).includes(n))||null,
    paid:!!(local.paid||{})[n],
  }));
  const scoreRows = TEAMS.map(t=>({
    team:t, wins: local.scores?.[t]?.win||0, losses: local.scores?.[t]?.lose||0
  }));
  const { error: e1 } = await sb.from("players").upsert(playerRows, { onConflict: "full_name" });
  if (e1) throw e1;
  const { error: e2 } = await sb.from("team_scores").upsert(scoreRows, { onConflict: "team" });
  if (e2) throw e2;
}

/* ------------------------------ UI ------------------------------- */
function Login({onLogin}){
  const [u,setU]=useState(""); const [p,setP]=useState(""); const [hide,setHide]=useState(false);
  const logo=useMemo(()=>safeLogo(import.meta.env?.VITE_LOGO_URL, typeof window!=="undefined"?window.__APP_LOGO__:undefined),[]);
  return(
    <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
      <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-lg text-center">
        {!hide ? <img src={logo} alt="Logo" className="w-28 h-28 mx-auto mb-6 object-contain" onError={()=>setHide(true)}/> :
          <div className="w-28 h-28 mx-auto mb-6 rounded-full bg-gray-100 grid place-items-center text-xs text-gray-500">No Logo</div>}
        <h1 className="text-2xl font-bold mb-6">Login</h1>
        <form onSubmit={(e)=>{e.preventDefault(); if(u===storedUsername && p===storedPassword) onLogin(u); else alert("Invalid");}} className="space-y-3">
          <input className="w-full border rounded-lg px-3 py-2" placeholder="Username" value={u} onChange={e=>setU(e.target.value)} />
          <input className="w-full border rounded-lg px-3 py-2" type="password" placeholder="Password" value={p} onChange={e=>setP(e.target.value)} />
          <button className="w-full h-10 rounded-lg bg-blue-600 text-white">Login</button>
        </form>
      </div>
    </div>
  );
}

export default function App(){
  const {user,login,logout}=useAuthUser();
  return user ? <League onLogout={logout}/> : <Login onLogin={login}/>;
}

function League({onLogout}){
  const [individuals,setIndividuals]=useState([]);
  const [teams,setTeams]=useState(emptyTeams);
  const [paid,setPaid]=useState({});
  const [scores,setScores]=useState(TEAMS.reduce((a,t)=>{a[t]={win:0,lose:0};return a;},{}));
  const [newName,setNewName]=useState("");
  const [conn, setConn] = useState(sb ? "online" : "local"); // connection badge

  /* ------------ initial load: remote → fallback to local ------------- */
  useEffect(()=>{(async()=>{
    const localSnap = loadLocal();
    if (sb) {
      try {
        const res = await sbFetchAll();
        const players = res?.players || [];
        // self-heal: remote empty but local has data → push local → reload from remote
        if (players.length === 0 && localSnap && (localSnap.individuals||[]).length > 0) {
          await sbBulkUpsert(localSnap);
          const res2 = await sbFetchAll();
          applyRemote(res2);
          setConn("online");
          return;
        }
        applyRemote(res);
        setConn("online");
        return;
      } catch (e) {
        console.warn("[supabase] fetch failed; using local snapshot", e);
        setConn("local");
      }
    }
    // local-only path
    if (localSnap) applyLocal(localSnap);
  })();},[]);

  // helpers to apply states
  function applyRemote(remote){
    if (!remote) return;
    const {players, scores: ts} = remote;
    setIndividuals(players.map(p=>p.full_name));
    const t = TEAMS.reduce((a,k)=>{a[k]=[];return a;},{});
    players.forEach(p=>{ if(p.team && t[p.team]) t[p.team].push(p.full_name); });
    setTeams(t);
    setPaid(players.reduce((a,p)=>{a[p.full_name]=!!p.paid;return a;},{}));
    const s = TEAMS.reduce((a,k)=>{a[k]={win:0,lose:0};return a;},{});
    (ts||[]).forEach(r=>{ if(s[r.team]) s[r.team]={win:r.wins||0,lose:r.losses||0}; });
    setScores(s);
    saveLocal({individuals:players.map(p=>p.full_name),teams:t,paid:players.reduce((a,p)=>{a[p.full_name]=!!p.paid;return a;},{}),scores:s});
  }
  function applyLocal(snap){
    setIndividuals(snap.individuals||[]);
    setTeams(snap.teams||emptyTeams);
    setPaid(snap.paid||{});
    setScores(snap.scores||TEAMS.reduce((a,t)=>{a[t]={win:0,lose:0};return a;},{}));
  }

  /* ------------- write-through local snapshot on change -------------- */
  useEffect(()=>{ saveLocal({individuals,teams,paid,scores}); },[individuals,teams,paid,scores]);

  /* ---------------- actions (write DB + local) ---------------- */
  const add = async(e)=>{ e.preventDefault(); const v=newName.trim(); if(!v) return;
    setNewName(""); setIndividuals(p=>p.concat(v));
    if (sb) {
      const { error } = await sb.from("players").upsert({ full_name:v, team:null, paid:false });
      if (error) { console.error(error); alert("Supabase insert blocked. Check RLS and env keys."); setConn("local"); }
    }
  };
  const assign = async(name, team)=>{
    setTeams(prev=>{const copy=Object.fromEntries(Object.entries(prev).map(([k,a])=>[k,a.filter(m=>m!==name)])); if(team) copy[team]=[...(copy[team]||[]),name]; return copy;});
    if (sb) {
      const { error } = await sb.from("players").upsert({ full_name:name, team, paid:!!paid[name] });
      if (error) { console.error(error); alert("Supabase upsert blocked."); setConn("local"); }
    }
  };
  const togglePaid = async(name)=>{
    setPaid(prev=>({...prev,[name]:!prev[name]}));
    if (sb) {
      const t = Object.keys(teams).find(k=>teams[k].includes(name))||null;
      const { error } = await sb.from("players").upsert({ full_name:name, team:t, paid:!paid[name] });
      if (error) { console.error(error); alert("Supabase update blocked."); setConn("local"); }
    }
  };
  const remove = async(name)=>{
    setIndividuals(prev=>prev.filter(n=>n!==name));
    setTeams(prev=>{const c={}; for(const k in prev) c[k]=prev[k].filter(m=>m!==name); return c;});
    setPaid(prev=>{const n={...prev}; delete n[name]; return n;});
    if (sb) {
      const { error } = await sb.from("players").delete().eq("full_name", name);
      if (error) { console.error(error); alert("Supabase delete blocked."); setConn("local"); }
    }
  };
  const inc = async(team,type,delta)=>{
    setScores(prev=>({...prev,[team]:nextScore(prev[team],type,delta)}));
    if (sb) {
      const cur = scores[team]||{win:0,lose:0};
      const nv = type==="win" ? {win:Math.max(0,cur.win+delta),lose:cur.lose} : {win:cur.win,lose:Math.max(0,cur.lose+delta)};
      const { error } = await sb.from("team_scores").upsert({ team, wins:nv.win, losses:nv.lose }, { onConflict:"team" });
      if (error) { console.error(error); alert("Supabase score update blocked."); setConn("local"); }
    }
  };

  /* ---------------------------- render ---------------------------- */
  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 md:p-8">
      <div className="mx-auto w-full max-w-6xl">
        {/* connection badge */}
        <div className="mb-2 text-right">
          <span className={`inline-block px-2 py-1 rounded text-xs ${conn==="online"?"bg-green-100 text-green-700":"bg-gray-200 text-gray-700"}`}>
            {conn==="online" ? "Supabase connected" : "Local mode (not syncing)"}
          </span>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold mb-4 text-center sm:text-left">Perpetual Alumni Mini League</h1>
          <form onSubmit={add} className="flex flex-col sm:flex-row gap-3">
            <input className="flex-1 border rounded-xl px-3 py-2 h-11" placeholder="Enter full name" value={newName} onChange={e=>setNewName(e.target.value)} />
            <button className="h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">Add</button>
          </form>
        </div>

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
                  <button type="button" onClick={()=>inc(team,"win", 1)} className="h-9 px-3 border rounded-lg">+W</button>
                  <button type="button" onClick={()=>inc(team,"win",-1)} className="h-9 px-3 border rounded-lg">-W</button>
                  <button type="button" onClick={()=>inc(team,"lose", 1)} className="h-9 px-3 border rounded-lg">+L</button>
                  <button type="button" onClick={()=>inc(team,"lose",-1)} className="h-9 px-3 border rounded-lg">-L</button>
                </div>
                <ul className="space-y-2">
                  {(teams[team]||[]).length ? (teams[team]||[]).map((m,idx)=>(
                    <li key={m} className="flex items-center gap-2">
                      <span className="font-medium w-6 text-right">{idx+1}.</span>
                      <span className="flex-1">{m}{paid[m] && <span className="ml-2 text-green-600 font-semibold">(Paid)</span>}</span>
                      <button type="button" onClick={()=>assign(m,"")} className="h-9 px-3 rounded-lg bg-red-500 text-white">Remove</button>
                    </li>
                  )) : <li className="text-gray-400">No players</li>}
                </ul>
              </section>
            );
          })}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6 mt-6">
          <h3 className="text-lg sm:text-xl font-semibold mb-3">Players</h3>
          <ol className="space-y-2">
            {individuals.map((name)=>{
              const assigned=Object.keys(teams).find(t=>teams[t].includes(name))||"";
              return (
                <li key={name} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <span className="flex-1 font-medium">
                    {name}{paid[name] && <span className="ml-2 text-green-600 font-semibold">(Paid)</span>}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <select className="border rounded-lg px-2 py-2 h-9" value={assigned} onChange={e=>assign(name,e.target.value)}>
                      <option value="">No Team</option>
                      {TEAMS.map(t=><option key={t} value={t}>Team {t}</option>)}
                    </select>
                    <button type="button" onClick={()=>remove(name)} className="h-9 px-3 rounded-lg bg-red-500 text-white">Delete</button>
                    <button type="button" onClick={()=>togglePaid(name)} className={`h-9 px-3 rounded-lg text-white ${paid[name]?"bg-green-700":"bg-green-500"}`}>
                      {paid[name]?"Unmark Paid":"Mark Paid"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex justify-center mt-6">
          <button type="button" onClick={onLogout} className="h-10 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white">Logout</button>
        </div>
      </div>
    </div>
  );
}
