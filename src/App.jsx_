// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";

/* ---------- Auth (localStorage + cookie) ---------- */
function setCookie(n,v,d=365){try{document.cookie=`${n}=${encodeURIComponent(v)}; Expires=${new Date(Date.now()+d*864e5).toUTCString()}; Path=/; SameSite=Lax`;}catch{}}
function getCookie(n){try{const m=document.cookie.match(new RegExp("(^| )"+n+"=([^;]+)"));return m?decodeURIComponent(m[2]):null;}catch{return null;}}
function delCookie(n){try{document.cookie=`${n}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`;}catch{}}
function useAuthUser(){
  const [user,setUser]=useState(()=>getCookie("auth_user")||localStorage.getItem("auth_user")||null);
  const login=(name)=>{try{localStorage.setItem("auth_user",name);}catch{};setCookie("auth_user",name);setUser(name);};
  const logout=()=>{try{localStorage.removeItem("auth_user");}catch{};delCookie("auth_user");setUser(null);};
  useEffect(()=>{const onStorage=e=>{if(e.key==="auth_user") setUser(e.newValue)};window.addEventListener("storage",onStorage);return()=>window.removeEventListener("storage",onStorage)},[]);
  return {user,login,logout};
}

/* ---------- Local cache (keeps data on refresh) ---------- */
const LS_KEY="paml:v1";
const loadLocal=()=>{try{const s=localStorage.getItem(LS_KEY);return s?JSON.parse(s):null;}catch{return null;}};
const saveLocal=(state)=>{try{localStorage.setItem(LS_KEY, JSON.stringify(state));}catch{}};

/* ---------- Helpers ---------- */
const TEAMS=["A","B","C","D","E","F","G","H","I","J"];
const emptyTeams=TEAMS.reduce((a,t)=>{a[t]=[];return a;},{});
const safeLogoSrc=(envUrl,globalUrl)=>globalUrl||envUrl||"/sports_logo.jpg";
const nextScore=(prev,type,delta)=>{const c=Math.max(0,Number(prev?.[type]??0));const n=Math.max(0,c+Number(delta||0));return {...prev,[type]:n};};

/* ---------- Demo creds ---------- */
let storedUsername="Admin";
let storedPassword="@lum2025!";

/* ---------- Supabase helpers (only used if window.sb exists) ---------- */
async function sbFetchAll(){
  if(!window.sb) return null;
  const [{data:players},{data:scores}] = await Promise.all([
    window.sb.from("players").select("full_name,team,paid").order("full_name",{ascending:true}),
    window.sb.from("team_scores").select("team,wins,losses"),
  ]);
  return {players:players||[],scores:scores||[]};
}
async function sbUpsertPlayer({full_name,team=null,paid=false}){ if(!window.sb) return; await window.sb.from("players").upsert({full_name,team,paid});}
async function sbDeletePlayer(full_name){ if(!window.sb) return; await window.sb.from("players").delete().eq("full_name",full_name);}
async function sbUpdateScore(team,win,lose){ if(!window.sb) return; await window.sb.from("team_scores").upsert({team,wins:win,losses:lose},{onConflict:"team"});}

/* ------------------------------------ UI ----------------------------------- */
function LoginPage({onLogin}){
  const [u,setU]=useState(""); const [p,setP]=useState(""); const [hideLogo,setHideLogo]=useState(false);
  const logoSrc=useMemo(()=>safeLogoSrc(import.meta.env?.VITE_LOGO_URL, typeof window!=="undefined"?window.__APP_LOGO__:undefined),[]);
  const submit=(e)=>{e.preventDefault(); if(u===storedUsername && p===storedPassword) onLogin(u); else alert("Invalid");};
  return(
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-lg flex flex-col items-center">
        {!hideLogo?<img src={logoSrc} alt="Logo" className="w-28 h-28 mb-6 object-contain" onError={()=>setHideLogo(true)} />:
          <div className="w-28 h-28 mb-6 rounded-full bg-gray-100 grid place-items-center text-sm text-gray-500">No Logo</div>}
        <h1 className="text-2xl font-bold mb-6">Login</h1>
        <form onSubmit={submit} className="space-y-4 w-full">
          <input className="w-full border rounded-lg px-3 py-2" placeholder="Username" value={u} onChange={e=>setU(e.target.value)} />
          <input className="w-full border rounded-lg px-3 py-2" placeholder="Password" type="password" value={p} onChange={e=>setP(e.target.value)} />
          <button className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">Login</button>
        </form>
      </div>
    </div>
  );
}

function PerpetualGymLeagueApp(){ const {user,login,logout}=useAuthUser(); return user?<PerpetualGymLeague onLogout={logout}/>:<LoginPage onLogin={login}/>; }
export default function App(){ return <PerpetualGymLeagueApp/>; }

function PerpetualGymLeague({onLogout}){
  const [individuals,setIndividuals]=useState([]);
  const [teams,setTeams]=useState(emptyTeams);
  const [paid,setPaid]=useState({});
  const [scores,setScores]=useState(TEAMS.reduce((a,t)=>{a[t]={win:0,lose:0};return a;},{}));
  const [newName,setNewName]=useState("");

  // confirm delete by NAME
  const [confirmType,setConfirmType]=useState(null);
  const [confirmDeleteName,setConfirmDeleteName]=useState(null);
  const [awaitingConfirm,setAwaitingConfirm]=useState(false);

  // edit state
  const [editingIndex,setEditingIndex]=useState(null);
  const [editingValue,setEditingValue]=useState("");

  // LOAD (Supabase if available; else localStorage)
  useEffect(()=>{(async()=>{
      if(window.sb){
        const res=await sbFetchAll(); if(!res) return;
        const {players,scores:ts}=res;
        setIndividuals(players.map(p=>p.full_name));
        const tmap=TEAMS.reduce((a,t)=>{a[t]=[];return a;},{});
        players.forEach(p=>{ if(p.team && tmap[p.team]) tmap[p.team].push(p.full_name);});
        setTeams(tmap);
        setPaid(players.reduce((a,p)=>{a[p.full_name]=!!p.paid;return a;},{}));
        const smap=TEAMS.reduce((a,t)=>{a[t]={win:0,lose:0};return a;},{});
        (ts||[]).forEach(r=>{ if(smap[r.team]) smap[r.team]={win:r.wins||0,lose:r.losses||0};});
        setScores(smap);
      }else{
        const s=loadLocal();
        if(s){ setIndividuals(s.individuals||[]); setTeams(s.teams||emptyTeams); setPaid(s.paid||{}); setScores(s.scores||TEAMS.reduce((a,t)=>{a[t]={win:0,lose:0};return a;},{})); }
      }
  })();},[]);

  // SAVE to localStorage
  useEffect(()=>{ saveLocal({individuals,teams,paid,scores}); },[individuals,teams,paid,scores]);

  /* ---- actions ---- */
  const add=async(e)=>{e.preventDefault();const v=newName.trim();if(!v)return;setNewName("");setIndividuals(p=>p.concat(v)); if(window.sb) await sbUpsertPlayer({full_name:v,team:null,paid:false});};

  const assign=async(name,team)=>{
    setTeams(prev=>{const copy=Object.fromEntries(Object.entries(prev).map(([k,arr])=>[k,arr.filter(m=>m!==name)])); if(team) copy[team]=[...(copy[team]||[]),name]; return copy;});
    if(window.sb) await sbUpsertPlayer({full_name:name,team,paid:!!paid[name]});
  };

  const markPaid=async(name)=>{
    setPaid(prev=>({...prev,[name]:!prev[name]}));
    if(window.sb) await sbUpsertPlayer({full_name:name,team:Object.keys(teams).find(t=>teams[t].includes(name))||null,paid:!paid[name]});
  };

  const updateScore=async(team,type,delta)=>{
    setScores(prev=>({...prev,[team]:nextScore(prev[team],type,delta)}));
    const cur=scores[team]||{win:0,lose:0};
    const nv=type==="win"?{win:Math.max(0,cur.win+delta),lose:cur.lose}:{win:cur.win,lose:Math.max(0,cur.lose+delta)};
    if(window.sb) await sbUpdateScore(team,nv.win,nv.lose);
  };

  const startEditing=(i,current)=>{setEditingIndex(i);setEditingValue(current);};
  const saveEdit=async(i)=>{
    const v=(editingValue||"").trim(); if(!v) return;
    const old=individuals[i];
    setIndividuals(prev=>prev.map((n,idx)=>idx===i?v:n));
    setTeams(prev=>{const copy={}; for(const k in prev) copy[k]=(prev[k]||[]).map(m=>m===old?v:m); return copy;});
    setPaid(prev=>{const ns={...prev}; if(prev[old]) ns[v]=true; delete ns[old]; return ns;});
    setEditingIndex(null); setEditingValue("");
    if(window.sb){ await sbDeletePlayer(old); const t=Object.keys(teams).find(tt=>(teams[tt]||[]).includes(v))||null; await sbUpsertPlayer({full_name:v,team:t,paid:!!paid[v]});}
  };

  const requestDelete=(name)=>{setConfirmType("deleteIndividual");setConfirmDeleteName(name);setAwaitingConfirm(true);};
  const cancelConfirm=()=>{setConfirmType(null);setConfirmDeleteName(null);setAwaitingConfirm(false);};
  const performConfirm=async()=>{
    if(!(confirmType==="deleteIndividual" && confirmDeleteName)) return cancelConfirm();
    const nameToDelete=confirmDeleteName;
    setIndividuals(prev=>prev.filter(n=>n!==nameToDelete));
    setTeams(prev=>{const copy={}; for(const k in prev) copy[k]=(prev[k]||[]).filter(m=>m!==nameToDelete); return copy;});
    setPaid(prev=>{const ns={...prev}; delete ns[nameToDelete]; return ns;});
    if(window.sb) await sbDeletePlayer(nameToDelete);
    cancelConfirm();
  };

  /* ---- render ---- */
  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 md:p-8">
      <div className="mx-auto w-full max-w-6xl">
        {/* Header / Add */}
        <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold mb-4 text-center sm:text-left">
            Perpetual Alumni Mini League
          </h1>
          <form onSubmit={add} className="flex flex-col sm:flex-row gap-3">
            <input
              className="flex-1 border rounded-xl px-3 py-2 h-11"
              placeholder="Enter full name"
              value={newName}
              onChange={e=>setNewName(e.target.value)}
            />
            <button className="h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
              Add
            </button>
          </form>
        </div>

        {/* Teams grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {TEAMS.map(team=>{
            const w=scores[team]?.win??0; const l=scores[team]?.lose??0;
            const members=(teams[team]||[]);
            return (
              <section key={team} className="bg-white rounded-2xl shadow-sm border p-4 sm:p-5">
                <h2 className="text-lg sm:text-xl font-semibold mb-3">
                  Team {team}
                  <span className="ml-3 text-sm font-normal">
                    (<span className="text-green-600">Win {w}</span> / <span className="text-red-600">Lose {l}</span>)
                  </span>
                </h2>

                <div className="flex flex-wrap gap-2 mb-3">
                  <button type="button" onClick={()=>updateScore(team,"win",1)} className="h-9 px-3 border rounded-lg">+W</button>
                  <button type="button" onClick={()=>updateScore(team,"win",-1)} className="h-9 px-3 border rounded-lg">-W</button>
                  <button type="button" onClick={()=>updateScore(team,"lose",1)} className="h-9 px-3 border rounded-lg">+L</button>
                  <button type="button" onClick={()=>updateScore(team,"lose",-1)} className="h-9 px-3 border rounded-lg">-L</button>
                </div>

                <ul className="space-y-2">
                  {members.length ? members.map((m, idx)=>(
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

        {/* Players list (assign, edit, delete) */}
        <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6 mt-6">
          <h3 className="text-lg sm:text-xl font-semibold mb-3">Players</h3>
          <ol className="space-y-2">
            {individuals.map((name,i)=>{
              const assigned=Object.keys(teams).find(t=>teams[t].includes(name))||"";
              return (
                <li key={name} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  {editingIndex===i?(
                    <div className="flex items-center gap-2 w-full">
                      <input className="border rounded-lg px-2 py-2 flex-1" value={editingValue} onChange={e=>setEditingValue(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveEdit(i)} autoFocus />
                      <button type="button" onClick={()=>saveEdit(i)} className="h-9 px-3 rounded-lg bg-green-600 text-white">Save</button>
                      <button type="button" onClick={()=>{setEditingIndex(null);setEditingValue("");}} className="h-9 px-3 rounded-lg bg-gray-400 text-white">Cancel</button>
                    </div>
                  ):(
                    <span className="flex-1 font-medium">
                      {name}{paid[name] && <span className="ml-2 text-green-600 font-semibold">(Paid)</span>}
                    </span>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <select className="border rounded-lg px-2 py-2 h-9" value={assigned} onChange={e=>assign(name,e.target.value)}>
                      <option value="">No Team</option>
                      {TEAMS.map(t=><option key={t} value={t}>Team {t}</option>)}
                    </select>

                    {editingIndex===i?null:(
                      <>
                        <button type="button" onClick={()=>startEditing(i,name)} className="h-9 px-3 rounded-lg bg-yellow-500 text-white">Edit</button>
                        <button type="button" onClick={()=>{setConfirmType("deleteIndividual");setConfirmDeleteName(name);setAwaitingConfirm(true);}} className="h-9 px-3 rounded-lg bg-red-500 text-white">Delete</button>
                        <button type="button" onClick={()=>markPaid(name)} className={`h-9 px-3 rounded-lg text-white ${paid[name]?"bg-green-700":"bg-green-500"}`}>
                          {paid[name]?"Unmark Paid":"Mark Paid"}
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Footer actions */}
        <div className="flex justify-center mt-6">
          <button type="button" onClick={onLogout} className="h-10 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white">
            Logout
          </button>
        </div>
      </div>

      {/* Confirm modal */}
      {confirmType==="deleteIndividual" && awaitingConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={cancelConfirm}/>
          <div className="relative z-10 bg-white rounded-2xl shadow-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-3">Delete Player</h3>
            <p className="mb-4">Delete <span className="font-semibold">{confirmDeleteName}</span>?</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={cancelConfirm} className="h-10 px-4 border rounded-xl">Cancel</button>
              <button type="button" onClick={performConfirm} className="h-10 px-4 rounded-xl bg-red-600 text-white">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
