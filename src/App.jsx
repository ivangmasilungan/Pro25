// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase as SB, pingSupabase } from "./lib/supabase";

/* ======= auth kept simple (cookie + localStorage) ======= */
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

/* ======= local snapshot (refresh-safe) ======= */
const LS_KEY="paml:v4";
const TEAMS=["A","B","C","D","E","F","G","H","I","J"];
const emptyTeams=TEAMS.reduce((a,t)=>{a[t]=[];return a;},{});
const loadLocal =()=>{try{const s=localStorage.getItem(LS_KEY);return s?JSON.parse(s):null;}catch{return null}};
const saveLocal =(state)=>{try{localStorage.setItem(LS_KEY,JSON.stringify(state));}catch{}};
const nextScore=(prev,type,delta)=>({ ...prev, [type]: Math.max(0, Number(prev?.[type]??0)+Number(delta||0)) });
const safeLogo=(envUrl,globalUrl)=>globalUrl||envUrl||"/sports_logo.jpg";

/* ======= demo creds (can be env-driven) ======= */
let storedUsername=import.meta.env?.VITE_APP_USERNAME || "Admin";
let storedPassword=import.meta.env?.VITE_APP_PASSWORD || "2025!";

/* ======= Supabase helpers ======= */
async function sbFetchAll(){
  const [{data:players, error:e1},{data:scores, error:e2}] = await Promise.all([
    SB.from("players").select("full_name,team,paid").order("full_name",{ascending:true}),
    SB.from("team_scores").select("team,wins,losses"),
  ]);
  if (e1||e2) throw (e1||e2);
  return {players:players||[], scores:scores||[]};
}
async function sbUpsertPlayer(row){ const {error}=await SB.from("players").upsert(row); if(error) throw error; }
async function sbDeletePlayer(name){ const {error}=await SB.from("players").delete().eq("full_name",name); if(error) throw error; }
async function sbUpsertScore(team,wins,losses){ const {error}=await SB.from("team_scores").upsert({team,wins,losses},{onConflict:"team"}); if(error) throw error; }
async function sbBulkUpsert(local){
  const playerRows=(local.individuals||[]).map(n=>({full_name:n,team:Object.keys(local.teams||{}).find(t=>(local.teams[t]||[]).includes(n))||null,paid:!!(local.paid||{})[n]}));
  const scoreRows=TEAMS.map(t=>({team:t,wins:local.scores?.[t]?.win||0,losses:local.scores?.[t]?.lose||0}));
  const r1=await SB.from("players").upsert(playerRows,{onConflict:"full_name"});
  const r2=await SB.from("team_scores").upsert(scoreRows,{onConflict:"team"});
  if (r1.error||r2.error) throw (r1.error||r2.error);
}

/* ======= UI ======= */
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

  // connection status + error
  const [conn,setConn]=useState("checking"); // 'online' | 'local' | 'checking'
  const [connErr,setConnErr]=useState("");

  // edit name
  const [editingName,setEditingName]=useState(null);
  const [editingValue,setEditingValue]=useState("");

// ===== initial sync (force-correct online detection) =====
useEffect(() => {
  (async () => {
    const localSnap = loadLocal();

    if (window.sb) {
      try {
        // 1) simple ping to prove connectivity + RLS
        const { error } = await window.sb.from("players").select("full_name").limit(1);
        if (error) throw error;

        // 2) ONLINE
        console.log("[conn] Supabase OK → online");
        setConn("online");
        setConnErr("");

        // 3) fetch remote and apply; seed if DB empty
        const remote = await sbFetchAll();
        if ((remote.players || []).length === 0 && localSnap && (localSnap.individuals || []).length > 0) {
          await sbBulkUpsert(localSnap);             // seed once from local snapshot
          const refetched = await sbFetchAll();
          applyRemote(refetched);
        } else {
          applyRemote(remote);
        }
        return;
      } catch (err) {
        console.warn("[conn] ping failed, going local:", err);
        setConn("local");
        setConnErr(String(err?.message || err));
      }
    } else {
      setConn("local");
      setConnErr("Supabase client not created (check VITE_SUPABASE_* and import './lib/supabase.js').");
    }

    if (localSnap) applyLocal(localSnap);            // fallback to local snapshot
  })();
}, []);

// ===== manual connection tester callable from Console =====
useEffect(() => {
  window.__testLive = async () => {
    try {
      const { error } = await window.sb.from("players").select("full_name").limit(1);
      if (error) throw error;
      setConn("online");
      setConnErr("");
      console.log("[conn] forced online via __testLive()");
    } catch (e) {
      setConn("local");
      setConnErr(String(e?.message || e));
      console.log("[conn] forced local via __testLive()", e);
    }
  };
  return () => { delete window.__testLive; };
}, []);

  /* ===== actions ===== */
  const add = async(e)=>{ e.preventDefault(); const v=newName.trim(); if(!v) return; setNewName(""); setIndividuals(p=>p.concat(v)); if(SB) try{ await sbUpsertPlayer({full_name:v,team:null,paid:false}); }catch(e){setConn("local");setConnErr(String(e?.message||e));}};
  const assign = async(name,team)=>{ setTeams(prev=>{const copy=Object.fromEntries(Object.entries(prev).map(([k,a])=>[k,a.filter(m=>m!==name)])); if(team) copy[team]=[...(copy[team]||[]),name]; return copy;}); if(SB) try{ await sbUpsertPlayer({full_name:name,team,paid:!!paid[name]}); }catch(e){setConn("local");setConnErr(String(e?.message||e));}};
  const togglePaid = async(name)=>{ setPaid(prev=>({...prev,[name]:!prev[name]})); if(SB) try{ const t=Object.keys(teams).find(k=>teams[k].includes(name))||null; await sbUpsertPlayer({full_name:name,team:t,paid:!paid[name]}); }catch(e){setConn("local");setConnErr(String(e?.message||e));}};
  const remove = async(name)=>{ setIndividuals(prev=>prev.filter(n=>n!==name)); setTeams(prev=>{const c={}; for(const k in prev) c[k]=prev[k].filter(m=>m!==name); return c;}); setPaid(prev=>{const n={...prev}; delete n[name]; return n;}); if(SB) try{ await sbDeletePlayer(name);}catch(e){setConn("local");setConnErr(String(e?.message||e));}};

  // edit name
  const beginEdit =(name)=>{ setEditingName(name); setEditingValue(name); };
  const cancelEdit =()=>{ setEditingName(null); setEditingValue(""); };
  const saveEdit   =async()=> {
    const oldName=editingName, newName=(editingValue||"").trim();
    if(!oldName || !newName || newName===oldName){ cancelEdit(); return; }
    setIndividuals(prev=>prev.map(n=>n===oldName?newName:n));
    setTeams(prev=>{const c={}; for(const t in prev) c[t]=(prev[t]||[]).map(m=>m===oldName?newName:m); return c;});
    setPaid(prev=>{const np={...prev}; if(np[oldName]) np[newName]=np[oldName]; delete np[oldName]; return np;});
    if(SB){ try{ const team=Object.keys(teams).find(t=>(teams[t]||[]).includes(oldName))||null; const wasPaid=!!paid[oldName]; await sbUpsertPlayer({full_name:newName,team,paid:wasPaid}); await sbDeletePlayer(oldName);}catch(e){setConn("local");setConnErr(String(e?.message||e));} }
    cancelEdit();
  };

  const inc = async(team,type,delta)=>{ setScores(prev=>({...prev,[team]:nextScore(prev[team],type,delta)})); if(SB) try{ const cur=scores[team]||{win:0,lose:0}; const nv= type==="win" ? {win:Math.max(0,cur.win+delta),lose:cur.lose} : {win:cur.win,lose:Math.max(0,cur.lose+delta)}; await sbUpsertScore(team,nv.win,nv.lose);}catch(e){setConn("local");setConnErr(String(e?.message||e));} };

  /* ===== render ===== */
  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 md:p-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-2 text-right">
          <span className={`inline-block px-2 py-1 rounded text-xs ${conn==="online"?"bg-green-100 text-green-700":conn==="checking"?"bg-yellow-100 text-yellow-800":"bg-gray-200 text-gray-700"}`}>
            {conn==="online"?"Supabase connected":conn==="checking"?"Checking…":"Local mode (not syncing)"}
          </span>
        </div>
        {conn!=="online" && connErr && (
          <div className="mb-4 text-sm bg-yellow-50 border border-yellow-200 text-yellow-800 rounded p-2">
            {connErr}
          </div>
        )}

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
                  {editingName === name ? (
                    <div className="flex items-center gap-2 w-full">
                      <input className="border rounded-lg px-2 py-2 flex-1" value={editingValue} onChange={(e)=>setEditingValue(e.target.value)} onKeyDown={(e)=>e.key==="Enter" && saveEdit()} autoFocus />
                      <button type="button" onClick={saveEdit} className="h-9 px-3 rounded-lg bg-green-600 text-white">Save</button>
                      <button type="button" onClick={cancelEdit} className="h-9 px-3 rounded-lg bg-gray-400 text-white">Cancel</button>
                    </div>
                  ) : (
                    <span className="flex-1 font-medium">
                      {name}{paid[name] && <span className="ml-2 text-green-600 font-semibold">(Paid)</span>}
                    </span>
                  )}

                  {editingName === name ? null : (
                    <div className="flex flex-wrap items-center gap-2">
                      <select className="border rounded-lg px-2 py-2 h-9" value={assigned} onChange={(e)=>assign(name,e.target.value)}>
                        <option value="">No Team</option>
                        {TEAMS.map(t=><option key={t} value={t}>Team {t}</option>)}
                      </select>
                      <button type="button" onClick={()=>{setEditingName(name); setEditingValue(name);}} className="h-9 px-3 rounded-lg bg-yellow-500 text-white">Edit</button>
                      <button type="button" onClick={()=>remove(name)} className="h-9 px-3 rounded-lg bg-red-500 text-white">Delete</button>
                      <button type="button" onClick={()=>togglePaid(name)} className={`h-9 px-3 rounded-lg text-white ${paid[name]?"bg-green-700":"bg-green-500"}`}>
                        {paid[name]?"Unmark Paid":"Mark Paid"}
                      </button>
                    </div>
                  )}
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
