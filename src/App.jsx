// src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import { supabase as SB } from "./lib/supabase";

/* ================== auth (cookie + localStorage) ================== */
function setCookie(n,v,d=365){document.cookie=`${n}=${encodeURIComponent(v)}; Expires=${new Date(Date.now()+d*864e5).toUTCString()}; Path=/; SameSite=Lax`;}
function getCookie(n){const m=document.cookie.match(new RegExp("(^| )"+n+"=([^;]+)"));return m?decodeURIComponent(m[2]):null}
function delCookie(n){document.cookie=`${n}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`}
function useAuthUser(){
  const [user,setUser]=useState(()=>getCookie("auth_user")||localStorage.getItem("auth_user")||null);
  const login =(name)=>{localStorage.setItem("auth_user",name); setCookie("auth_user",name); setUser(name);};
  const logout=()=>{localStorage.removeItem("auth_user"); delCookie("auth_user"); setUser(null);};
  useEffect(()=>{const onStorage=e=>{if(e.key==="auth_user") setUser(e.newValue)}; window.addEventListener("storage",onStorage); return()=>window.removeEventListener("storage",onStorage)},[]);
  return {user,login,logout};
}

/* ================== constants & local snapshot ================== */
const TEAMS=["A","B","C","D","E","F","G","H","I","J"];
const emptyTeams=TEAMS.reduce((a,t)=>{a[t]=[];return a;},{});
const LS_KEY="paml:v6";
const loadLocal =()=>{try{const s=localStorage.getItem(LS_KEY);return s?JSON.parse(s):null;}catch{return null}};
const saveLocal =(state)=>{try{localStorage.setItem(LS_KEY,JSON.stringify(state));}catch{}};
const nextScore =(prev,type,delta)=>({ ...prev, [type]: Math.max(0, Number(prev?.[type]??0)+Number(delta||0)) });

/* ================== creds (override via env) ================== */
let storedUsername=import.meta.env?.VITE_APP_USERNAME || "Admin";
let storedPassword=import.meta.env?.VITE_APP_PASSWORD || "2025!";

/* ================== Supabase helpers ================== */
async function sbFetchAll(){
  const [
    {data:players, error:ep},
    {data:scores,  error:es},
    {data:games,   error:eg},
  ] = await Promise.all([
    SB.from("players").select("full_name,team,paid,payment_method").order("full_name",{ascending:true}),
    SB.from("team_scores").select("team,wins,losses"),
    SB.from("games").select("id,title,team_a,team_b,gdate,gtime,location,created_at").order("created_at",{ascending:true}),
  ]);
  if (ep||es||eg) throw (ep||es||eg);
  return {players:players||[], scores:scores||[], games:games||[]};
}
async function sbUpsertPlayer(row){ const {error}=await SB.from("players").upsert(row); if(error) throw error; }
async function sbDeletePlayer(name){ const {error}=await SB.from("players").delete().eq("full_name",name); if(error) throw error; }
async function sbDeleteAllPlayers(){ const {error}=await SB.from("players").delete().neq("full_name",""); if(error) throw error; }
async function sbUpsertScore(team,wins,losses){ const {error}=await SB.from("team_scores").upsert({team,wins,losses},{onConflict:"team"}); if(error) throw error; }
async function sbBulkUpsert(local){
  const playerRows=(local.individuals||[]).map(n=>({
    full_name:n,
    team:Object.keys(local.teams||{}).find(t=>(local.teams[t]||[]).includes(n))||null,
    paid:!!(local.paid && local.paid[n]),
    payment_method:(local.paid && local.paid[n]) || null
  }));
  const scoreRows=TEAMS.map(t=>({team:t,wins:local.scores?.[t]?.win||0,losses:local.scores?.[t]?.lose||0}));
  const r1=await SB.from("players").upsert(playerRows,{onConflict:"full_name"});
  const r2=await SB.from("team_scores").upsert(scoreRows,{onConflict:"team"});
  if (r1.error||r2.error) throw (r1.error||r2.error);
}
async function sbInsertGame(row){ const {data,error}=await SB.from("games").insert(row).select().single(); if(error) throw error; return data; }
async function sbUpdateGame(id,row){ const {error}=await SB.from("games").update(row).eq("id",id); if(error) throw error; }
async function sbDeleteGame(id){ const {error}=await SB.from("games").delete().eq("id",id); if(error) throw error; }

/* ================== Login ================== */
function Login({ onLogin }){
  const [u,setU]=useState(""); 
  const [p,setP]=useState("");
  const [hideLogo, setHideLogo] = useState(false);
  const logoUrl = import.meta.env?.VITE_LOGO_URL || "/sports_logo.jpg";

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md text-center">
        {!hideLogo ? (
          <img
            src={logoUrl}
            alt="League Logo"
            className="w-28 h-28 mx-auto mb-6 object-contain"
            onError={() => setHideLogo(true)}
          />
        ) : (
          <div className="w-28 h-28 mx-auto mb-6 rounded-full bg-gray-100 grid place-items-center text-xs text-gray-500">
            No Logo
          </div>
        )}

        <h1 className="text-2xl font-bold mb-6">Login</h1>

        <form
          onSubmit={(e)=>{e.preventDefault(); if(u===storedUsername && p===storedPassword) onLogin(u); else alert("Invalid");}}
          className="space-y-3"
        >
          <input className="w-full border rounded-lg px-3 py-2" placeholder="Username" value={u} onChange={e=>setU(e.target.value)} />
          <input className="w-full border rounded-lg px-3 py-2" type="password" placeholder="Password" value={p} onChange={e=>setP(e.target.value)} />
          <button className="w-full h-10 rounded-lg bg-blue-600 text-white">Login</button>
        </form>
      </div>
    </div>
  );
}

/* ================== App Shell ================== */
export default function App(){
  const {user,login,logout}=useAuthUser();
  return user ? <League onLogout={logout}/> : <Login onLogin={login}/>;
}

/* ================== Main League ================== */
function League({ onLogout }){
  const [individuals,setIndividuals]=useState([]);
  const [teams,setTeams]=useState(emptyTeams);
  // paid stores method: "cash" | "gcash" | undefined
  const [paid,setPaid]=useState({});
  const [scores,setScores]=useState(TEAMS.reduce((a,t)=>{a[t]={win:0,lose:0};return a;},{}));
  const [newName,setNewName]=useState("");

  const [conn,setConn]=useState("checking"); // "online" | "local" | "checking"
  const [connErr,setConnErr]=useState("");

  const [editingName,setEditingName]=useState(null);
  const [editingValue,setEditingValue]=useState("");

  // highlight new item
  const [flashName,setFlashName]=useState(null);
  const itemRefs=useRef({}); // name -> element

  // payment modal
  const [payFor,setPayFor]=useState(null);
  const [showPayModal,setShowPayModal]=useState(false);

  // clear-all modal
  const [showClearModal, setShowClearModal] = useState(false);

  // logout confirm modal
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // delete player confirm modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // ======== Games state & edit modal =========
  const [games, setGames] = useState([]); // {id?, title, team_a, team_b, gdate, gtime, location}
  const [gTitle, setGTitle] = useState("");      // add form
  const [gDate,  setGDate]  = useState("");
  const [gTime,  setGTime]  = useState("");
  const [gLoc,   setGLoc]   = useState("");
  const [gTeamA, setGTeamA] = useState("");
  const [gTeamB, setGTeamB] = useState("");

  const [editGame, setEditGame] = useState(null); // game object
  const [showGameEditModal, setShowGameEditModal] = useState(false);

  /* ---------- apply helpers ---------- */
  function makeLocalSnapshot(extra={}) {
    return { individuals, teams, paid, scores, games, ...extra };
  }
  function applyRemote(remote){
    const {players, scores:ts, games:gs}=remote||{players:[],scores:[],games:[]};

    setIndividuals(players.map(p=>p.full_name));

    const t=TEAMS.reduce((a,k)=>{a[k]=[];return a;},{});
    players.forEach(p=>{ if(p.team && t[p.team]) t[p.team].push(p.full_name); });
    setTeams(t);

    setPaid(players.reduce((a,p)=>{ a[p.full_name] = p.payment_method || (p.paid ? "cash" : undefined); return a; },{}));

    const s=TEAMS.reduce((a,k)=>{a[k]={win:0,lose:0};return a;},{});
    (ts||[]).forEach(r=>{ if(s[r.team]) s[r.team]={win:r.wins||0,lose:r.losses||0}; });
    setScores(s);

    setGames(gs.map(g=>({
      id:g.id, title:g.title, team_a:g.team_a||"", team_b:g.team_b||"",
      gdate:g.gdate||"", gtime:g.gtime||"", location:g.location||""
    })));

    saveLocal({individuals:players.map(p=>p.full_name), teams:t,
               paid:players.reduce((a,p)=>{ a[p.full_name] = p.payment_method || (p.paid ? "cash" : undefined); return a; },{}),
               scores:s, games:gs});
  }
  function applyLocal(snap){
    setIndividuals(snap.individuals||[]);
    setTeams(snap.teams||emptyTeams);
    setPaid(snap.paid||{});
    setScores(snap.scores||TEAMS.reduce((a,t)=>{a[t]={win:0,lose:0};return a;},{}));
    setGames((snap.games||[]).map(g=>({
      id:g.id||g.id, title:g.title||"", team_a:g.team_a||"", team_b:g.team_b||"",
      gdate:g.gdate||"", gtime:g.gtime||"", location:g.location||""
    })));
  }

  /* ---------- initial sync: online first ---------- */
  useEffect(() => {
    (async () => {
      const localSnap=loadLocal();

      if (window.sb) {
        try {
          const { error } = await window.sb.from("players").select("full_name").limit(1);
          if (error) throw error;

          setConn("online");
          setConnErr("");
          const remote = await sbFetchAll();
          if ((remote.players||[]).length===0 && localSnap && (localSnap.individuals||[]).length>0) {
            await sbBulkUpsert(localSnap);
            applyRemote(await sbFetchAll());
          } else {
            applyRemote(remote);
          }
          return;
        } catch (err) {
          setConn("local");
          setConnErr(String(err?.message||err));
        }
      } else {
        setConn("local");
        setConnErr("Supabase client not created (check VITE_SUPABASE_* envs and import './lib/supabase.js').");
      }

      if (localSnap) applyLocal(localSnap);
    })();
  }, []);

  /* ---------- realtime (optional) ---------- */
  useEffect(()=>{
    if (!SB) return;
    const ch=SB.channel("league-sync")
      .on("postgres_changes",{event:"*",schema:"public",table:"players"},()=>refetch())
      .on("postgres_changes",{event:"*",schema:"public",table:"team_scores"},()=>refetch())
      .on("postgres_changes",{event:"*",schema:"public",table:"games"},()=>refetch())
      .subscribe();
    async function refetch(){ try{ applyRemote(await sbFetchAll()); }catch(e){ console.warn("realtime fetch failed",e); } }
    return ()=>{ try{SB.removeChannel(ch);}catch{} };
  },[]);

  /* ---------- persist local on any change ---------- */
  useEffect(()=>{ saveLocal(makeLocalSnapshot()); },[individuals,teams,paid,scores,games]);

  /* ---------- player actions ---------- */
  const add = async(e)=>{
    e.preventDefault();
    const v=newName.trim();
    if(!v) return;
    setNewName("");
    setIndividuals(prev => [v, ...prev]);
    if(SB){
      try{ await sbUpsertPlayer({ full_name:v, team:null, paid:false, payment_method:null }); }
      catch(e){ setConn("local"); setConnErr(String(e?.message||e)); }
    }
    setFlashName(v);
    setTimeout(()=>{ const el=itemRefs.current[v]; if(el?.scrollIntoView) el.scrollIntoView({behavior:"smooth",block:"center"}); }, 50);
    setTimeout(()=>setFlashName(null), 1500);
  };

  const assign = async(name,team)=>{
    setTeams(prev=>{const copy=Object.fromEntries(Object.entries(prev).map(([k,a])=>[k,a.filter(m=>m!==name)])); if(team) copy[team]=[...(copy[team]||[]),name]; return copy;});
    if(SB) try{ await sbUpsertPlayer({full_name:name,team,paid:!!paid[name],payment_method:paid[name]||null}); }catch(e){ setConn("local"); setConnErr(String(e?.message||e)); }
  };

  const beginEdit =(name)=>{ setEditingName(name); setEditingValue(name); };
  const cancelEdit =()=>{ setEditingName(null); setEditingValue(""); };
  const saveEdit   =async()=> {
    const oldName=editingName, newName=(editingValue||"").trim();
    if(!oldName || !newName || newName===oldName){ cancelEdit(); return; }
    setIndividuals(prev=>prev.map(n=>n===oldName?newName:n));
    setTeams(prev=>{const c={}; for(const t in prev) c[t]=(prev[t]||[]).map(m=>m===oldName?newName:m); return c;});
    setPaid(prev=>{const np={...prev}; if(np[oldName]) np[newName]=np[oldName]; delete np[oldName]; return np;});
    if(SB){ try{
      const team=Object.keys(teams).find(t=>(teams[t]||[]).includes(oldName))||null;
      const method = paid[oldName] || null;
      await sbUpsertPlayer({full_name:newName,team,paid:!!method,payment_method:method});
      await sbDeletePlayer(oldName);
    }catch(e){ setConn("local"); setConnErr(String(e?.message||e)); } }
    cancelEdit();
  };

  const inc = async(team,type,delta)=>{
    setScores(prev=>({...prev,[team]:nextScore(prev[team],type,delta)}));
    if(SB) try{
      const cur=scores[team]||{win:0,lose:0};
      const nv= type==="win" ? {win:Math.max(0,cur.win+delta),lose:cur.lose} : {win:cur.win,lose:Math.max(0,cur.lose+delta)};
      await sbUpsertScore(team,nv.win,nv.lose);
    }catch(e){ setConn("local"); setConnErr(String(e?.message||e)); }
  };

  // Payment modal
  const openPayment = (name)=>{ setPayFor(name); setShowPayModal(true); };
  const setPayment = async(method)=>{ // "cash" | "gcash" | null
    const name = payFor;
    if (!name) return;
    setPaid(prev => {
      const np = {...prev};
      if (method) np[name] = method; else delete np[name];
      return np;
    });
    if (SB) {
      try {
        const team = Object.keys(teams).find(t => (teams[t]||[]).includes(name)) || null;
        await sbUpsertPlayer({ full_name: name, team, paid: !!method, payment_method: method });
      } catch(e) {
        setConn("local");
        setConnErr(String(e?.message||e));
      }
    }
    setShowPayModal(false);
    setPayFor(null);
  };

  // Delete with confirm
  const requestDelete = (name) => { setDeleteTarget(name); setShowDeleteModal(true); };
  const doDelete = async () => {
    const name = deleteTarget;
    if (!name) { setShowDeleteModal(false); return; }
    setIndividuals(prev=>prev.filter(n=>n!==name));
    setTeams(prev=>{const c={}; for(const k in prev) c[k]=prev[k].filter(m=>m!==name); return c;});
    setPaid(prev=>{const n={...prev}; delete n[name]; return n;});
    if(SB) try{ await sbDeletePlayer(name);}catch(e){ setConn("local"); setConnErr(String(e?.message||e)); }
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  // Clear All Players
  const doClearAll = async ()=>{
    if (SB) { try { await sbDeleteAllPlayers(); } catch (e) { setConn("local"); setConnErr(String(e?.message||e)); } }
    setIndividuals([]);
    setTeams(emptyTeams);
    setPaid({});
    saveLocal(makeLocalSnapshot({individuals:[],teams:emptyTeams,paid:{}}));
    setShowClearModal(false);
  };

  // Logout
  const doLogout = ()=>{
    setShowLogoutModal(false);
    onLogout();
  };

  /* ---------- Game Schedule actions ---------- */
  function resetGameForm() { setGTitle(""); setGDate(""); setGTime(""); setGLoc(""); setGTeamA(""); setGTeamB(""); }
  function defaultNextTitle() { const n=(games?.length||0)+1; return `Game ${n}`; }

  const addGame = async (e)=>{
    e.preventDefault();
    const row = {
      title: (gTitle||"").trim() || defaultNextTitle(),
      team_a: gTeamA || null,
      team_b: gTeamB || null,
      gdate:  gDate  || null,
      gtime:  gTime  || null,
      location: gLoc || null,
    };
    if (SB) {
      try {
        const inserted = await sbInsertGame(row);
        setGames(prev => [...prev, {
          id: inserted.id, title: inserted.title, team_a: inserted.team_a||"",
          team_b: inserted.team_b||"", gdate: inserted.gdate||"",
          gtime: inserted.gtime||"", location: inserted.location||""
        }]);
      } catch (e) {
        setConn("local"); setConnErr(String(e?.message||e));
        setGames(prev => [...prev, { id: crypto.randomUUID?.() || String(Date.now()), ...row }]);
      }
    } else {
      setGames(prev => [...prev, { id: crypto.randomUUID?.() || String(Date.now()), ...row }]);
    }
    resetGameForm();
  };

  const requestEditGame = (g)=>{ setEditGame({...g}); setShowGameEditModal(true); };
  const saveGameEdit = async ()=>{
    const g = editGame; if (!g) return;
    const id = g.id;
    const row = {
      title: (g.title||"").trim() || "Game",
      team_a: g.team_a || null,
      team_b: g.team_b || null,
      gdate:  g.gdate  || null,
      gtime:  g.gtime  || null,
      location: g.location || null,
    };
    setGames(prev => prev.map(x => x.id===id ? {...x, ...row} : x));
    if (SB) { try { await sbUpdateGame(id, row); } catch(e) { setConn("local"); setConnErr(String(e?.message||e)); } }
    setShowGameEditModal(false);
    setEditGame(null);
  };
  const deleteGame = async (id)=>{
    setGames(prev => prev.filter(g => g.id !== id));
    if (SB) { try { await sbDeleteGame(id); } catch(e) { setConn("local"); setConnErr(String(e?.message||e)); } }
  };

  /* ---------- helpers for game roster ---------- */
  const rosterFor = (teamLetter)=>{
    if (!teamLetter || !teams[teamLetter]) return [];
    return teams[teamLetter];
  };

  /* ---------- UI ---------- */
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

        {/* Header + Add form + COUNTER */}
        <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold">
              Perpetual Alumni Mini League
              <span className="ml-3 align-middle text-sm font-semibold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">
                {individuals.length} {individuals.length === 1 ? "Player" : "Players"}
              </span>
            </h1>
          </div>

          <form onSubmit={add} className="mt-4 flex flex-col sm:flex-row gap-3">
            <input className="flex-1 border rounded-xl px-3 py-2 h-11" placeholder="Enter full name" value={newName} onChange={(e)=>setNewName(e.target.value)} />
            <button className="h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">Add</button>
          </form>
        </div>

        {/* --------- PLAYERS (FIRST) --------- */}
        <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6 mb-6">
          <h3 className="text-lg sm:text-xl font-semibold mb-3">Players</h3>
          <ol className="space-y-2">
            {individuals.map((name)=>{
              const assigned=Object.keys(teams).find(t=>teams[t].includes(name))||"";
              const method = paid[name]; // "cash" | "gcash" | undefined
              const paidBadge = method === "gcash" ? "text-blue-700 bg-blue-100" : "text-green-700 bg-green-100";

              return (
                <li
                  key={name}
                  ref={el => { if (el) itemRefs.current[name] = el; }}
                  className={
                    "flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-lg px-2 py-1 " +
                    (flashName===name ? "bg-yellow-50 ring-1 ring-yellow-200 transition-colors" : "")
                  }
                >
                  {editingName === name ? (
                    <div className="flex items-center gap-2 w-full">
                      <input className="border rounded-lg px-2 py-2 flex-1" value={editingValue} onChange={(e)=>setEditingValue(e.target.value)} onKeyDown={(e)=>e.key==="Enter" && saveEdit()} autoFocus />
                      <button type="button" onClick={saveEdit} className="h-9 px-3 rounded-lg bg-green-600 text-white">Save</button>
                      <button type="button" onClick={cancelEdit} className="h-9 px-3 rounded-lg bg-gray-400 text-white">Cancel</button>
                    </div>
                  ) : (
                    <span className="flex-1 font-medium">
                      {name}
                      {method && (
                        <span className={`ml-2 inline-flex items-center gap-1 ${paidBadge} px-2 py-0.5 rounded-full text-xs`}>
                          Paid ({method === "cash" ? "Cash" : "GCash"})
                        </span>
                      )}
                    </span>
                  )}

                  {editingName === name ? null : (
                    <div className="flex flex-wrap items-center gap-2">
                      <select className="border rounded-lg px-2 py-2 h-9" value={assigned} onChange={(e)=>assign(name,e.target.value)}>
                        <option value="">No Team</option>
                        {TEAMS.map(t=><option key={t} value={t}>Team {t}</option>)}
                      </select>

                      <button
                        type="button"
                        onClick={()=>openPayment(name)}
                        className={`h-9 px-3 rounded-lg text-white ${method === "gcash" ? "bg-sky-700" : method === "cash" ? "bg-green-700" : "bg-green-500"}`}
                        title={method ? `Change payment (currently ${method})` : "Set payment"}
                      >
                        {method ? "Change Paid" : "Paid"}
                      </button>

                      <button type="button" onClick={()=>{setEditingName(name); setEditingValue(name);}} className="h-9 px-3 rounded-lg bg-yellow-500 text-white">Edit</button>
                      <button type="button" onClick={()=>requestDelete(name)} className="h-9 px-3 rounded-lg bg-red-500 text-white">Delete</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* --------- GAME SCHEDULE (shows rosters) --------- */}
        <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6 mb-6">
          <h3 className="text-lg sm:text-xl font-semibold mb-3">Game Schedule</h3>

          {/* Add form */}
          <form onSubmit={addGame} className="grid grid-cols-1 md:grid-cols-6 gap-2 md:gap-3 mb-4">
            <input
              className="border rounded-lg px-3 py-2 h-11 md:col-span-2"
              placeholder={`Title (e.g., ${((games?.length||0)+1) ? `Game ${(games?.length||0)+1}` : "Game 1"})`}
              value={gTitle} onChange={e=>setGTitle(e.target.value)}
            />
            <select className="border rounded-lg px-3 py-2 h-11" value={gTeamA} onChange={e=>setGTeamA(e.target.value)}>
              <option value="">-------</option>
              {TEAMS.map(t=> <option key={t} value={t}>Team {t}</option>)}
            </select>
            <select className="border rounded-lg px-3 py-2 h-11" value={gTeamB} onChange={e=>setGTeamB(e.target.value)}>
              <option value="">-------</option>
              {TEAMS.map(t=> <option key={t} value={t}>Team {t}</option>)}
            </select>
            <input className="border rounded-lg px-3 py-2 h-11" type="date" value={gDate} onChange={e=>setGDate(e.target.value)} />
            <input className="border rounded-lg px-3 py-2 h-11" type="time" value={gTime} onChange={e=>setGTime(e.target.value)} />
            <input className="border rounded-lg px-3 py-2 h-11 md:col-span-3" placeholder="Location / Court" value={gLoc} onChange={e=>setGLoc(e.target.value)} />
            <button className="h-11 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white md:col-span-3">Add Game</button>
          </form>

          {/* List */}
          <div className="space-y-3">
            {games.length===0 ? (
              <div className="text-gray-500 text-sm">No games yet. Add one above.</div>
            ) : games.map((g,idx)=>{
              const a = (g.team_a||"").trim();
              const b = (g.team_b||"").trim();
              const rosterA = rosterFor(a);
              const rosterB = rosterFor(b);
              return (
                <div key={g.id} className="border rounded-2xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <div className="font-semibold min-w-24">{g.title || `Game ${idx+1}`}</div>
                    <div className="text-sm text-gray-700 flex-1">
                      {(a||b) ? (
                        <span>Team {a || "?"} vs Team {b || "?"}</span>
                      ) : <span className="text-gray-400">Unassigned teams</span>}
                      <span className="ml-3">
                        {g.gdate ? new Date(g.gdate).toLocaleDateString() : "No date"}
                        {g.gtime ? ` ${g.gtime}` : ""}
                      </span>
                      {g.location ? <span className="ml-3">• {g.location}</span> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="h-9 px-3 rounded-lg bg-yellow-500 text-white" onClick={()=>requestEditGame(g)}>Edit</button>
                      <button className="h-9 px-3 rounded-lg bg-red-500 text-white" onClick={()=>deleteGame(g.id)}>Delete</button>
                    </div>
                  </div>

                  {/* Rosters */}
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-lg border p-3">
                      <div className="font-medium mb-2">Team {a || "?"} Roster</div>
                      {rosterA.length ? (
                        <ul className="text-sm list-disc list-inside space-y-1">
                          {rosterA.map((n,i)=><li key={n+i}>{n}</li>)}
                        </ul>
                      ) : <div className="text-sm text-gray-500">No players</div>}
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="font-medium mb-2">Team {b || "?"} Roster</div>
                      {rosterB.length ? (
                        <ul className="text-sm list-disc list-inside space-y-1">
                          {rosterB.map((n,i)=><li key={n+i}>{n}</li>)}
                        </ul>
                      ) : <div className="text-sm text-gray-500">No players</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* --------- TEAMS (AFTER) --------- */}
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
                  {(teams[team]||[]).length ? (teams[team]||[]).map((m,idx)=>{
                    const method = paid[m];
                    const paidBadge = method === "gcash" ? "text-blue-700 bg-blue-100" : "text-green-700 bg-green-100";
                    return (
                      <li key={m} className="flex items-center gap-2">
                        <span className="font-medium w-6 text-right">{idx+1}.</span>
                        <span className="flex-1">
                          {m}
                          {method && (
                            <span className={`ml-2 inline-flex items-center gap-1 ${paidBadge} px-2 py-0.5 rounded-full text-xs`}>
                              Paid ({method === "cash" ? "Cash" : "GCash"})
                            </span>
                          )}
                        </span>
                        <button type="button" onClick={()=>assign(m,"")} className="h-9 px-3 rounded-lg bg-red-500 text-white">Remove</button>
                      </li>
                    );
                  }) : <li className="text-gray-400">No players</li>}
                </ul>
              </section>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
          <button type="button" onClick={()=>setShowClearModal(true)} className="h-10 px-5 rounded-xl border text-red-700 border-red-300 hover:bg-red-50">
            Clear All Players
          </button>
          <button type="button" onClick={()=>setShowLogoutModal(true)} className="h-10 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white">
            Logout
          </button>
        </div>
      </div>

      {/* ===== Payment Modal ===== */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=>{setShowPayModal(false); setPayFor(null);}} />
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

      {/* ===== Delete Player Confirm Modal ===== */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=>{setShowDeleteModal(false); setDeleteTarget(null);}} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-[92%] max-w-md">
            <h4 className="text-lg font-semibold mb-2">Delete player?</h4>
            <p className="text-sm text-gray-600 mb-4">
              This will remove <span className="font-medium">{deleteTarget}</span> from the list and any team assignments.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={()=>{setShowDeleteModal(false); setDeleteTarget(null);}} className="h-10 px-4 rounded-lg border">Cancel</button>
              <button onClick={doDelete} className="h-10 px-4 rounded-lg bg-red-600 text-white">Yes, Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Clear-All Modal ===== */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
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

      {/* ===== Logout Confirm Modal ===== */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=>setShowLogoutModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-[92%] max-w-md">
            <h4 className="text-lg font-semibold mb-2">Log out?</h4>
            <p className="text-sm text-gray-600 mb-4">You will be returned to the login screen.</p>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setShowLogoutModal(false)} className="h-10 px-4 rounded-lg border">Cancel</button>
              <button onClick={doLogout} className="h-10 px-4 rounded-lg bg-rose-600 text-white">Yes, Logout</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Game Edit Modal ===== */}
      {showGameEditModal && editGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=>{setShowGameEditModal(false); setEditGame(null);}} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-[92%] max-w-lg">
            <h4 className="text-lg font-semibold mb-3">Edit Game</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input className="border rounded-lg px-3 py-2 h-11" placeholder="Title" value={editGame.title||""} onChange={e=>setEditGame({...editGame, title:e.target.value})}/>
              <input className="border rounded-lg px-3 py-2 h-11" type="date" value={editGame.gdate||""} onChange={e=>setEditGame({...editGame, gdate:e.target.value})}/>
              <input className="border rounded-lg px-3 py-2 h-11" type="time" value={editGame.gtime||""} onChange={e=>setEditGame({...editGame, gtime:e.target.value})}/>
              <input className="border rounded-lg px-3 py-2 h-11" placeholder="Location" value={editGame.location||""} onChange={e=>setEditGame({...editGame, location:e.target.value})}/>
              <select className="border rounded-lg px-3 py-2 h-11" value={editGame.team_a||""} onChange={e=>setEditGame({...editGame, team_a:e.target.value})}>
                <option value="">-------</option>
                {TEAMS.map(t=><option key={t} value={t}>Team {t}</option>)}
              </select>
              <select className="border rounded-lg px-3 py-2 h-11" value={editGame.team_b||""} onChange={e=>setEditGame({...editGame, team_b:e.target.value})}>
                <option value="">-------</option>
                {TEAMS.map(t=><option key={t} value={t}>Team {t}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={()=>{setShowGameEditModal(false); setEditGame(null);}} className="h-10 px-4 rounded-lg border">Cancel</button>
              <button onClick={async()=>{ // save
                const g = editGame; if (!g) return;
                const id = g.id;
                const row = {
                  title:(g.title||"").trim()||"Game",
                  team_a:g.team_a||null, team_b:g.team_b||null,
                  gdate:g.gdate||null, gtime:g.gtime||null, location:g.location||null,
                };
                setGames(prev=>prev.map(x=>x.id===id?{...x,...row}:x));
                if (SB) { try { await sbUpdateGame(id,row); } catch(e){ setConn("local"); setConnErr(String(e?.message||e)); } }
                setShowGameEditModal(false); setEditGame(null);
              }} className="h-10 px-4 rounded-lg bg-blue-600 text-white">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
