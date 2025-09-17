// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";

/* -------------------- Persisted Auth: localStorage + cookie -------------------- */
function setCookie(name, value, days = 365) {
  try {
    const exp = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; Expires=${exp}; Path=/; SameSite=Lax`;
  } catch {}
}
function getCookie(name) {
  try {
    const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return m ? decodeURIComponent(m[2]) : null;
  } catch { return null; }
}
function delCookie(name) {
  try { document.cookie = `${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`; } catch {}
}

function useAuthUser() {
  // read synchronously -> no flicker on first paint
  const [user, setUser] = useState(() => getCookie("auth_user") || localStorage.getItem("auth_user") || null);

  const login = (name) => {
    try { localStorage.setItem("auth_user", name); } catch {}
    setCookie("auth_user", name);
    setUser(name);
  };
  const logout = () => {
    try { localStorage.removeItem("auth_user"); } catch {}
    delCookie("auth_user");
    setUser(null);
  };

  // keep multiple tabs in sync
  useEffect(() => {
    const onStorage = (e) => { if (e.key === "auth_user") setUser(e.newValue); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { user, login, logout };
}

/* --------------------------------- Helpers --------------------------------- */
function safeLogoSrc(envUrl, globalUrl) {
  if (globalUrl && typeof globalUrl === "string") return globalUrl;
  if (envUrl && typeof envUrl === "string") return envUrl;
  return "/sports_logo.jpg";
}
function nextScore(prev, type, delta) {
  const current = Math.max(0, Number(prev?.[type] ?? 0));
  const n = Math.max(0, current + Number(delta || 0));
  return { ...prev, [type]: n };
}

/* --------------------------- Demo credentials --------------------------- */
let storedUsername = "Admin";
let storedPassword = "@lum2025!";

/* ----------------------- Supabase-aware data helpers ----------------------- */
const TEAMS = ["A","B","C","D","E","F","G","H","I","J"];
const emptyTeams = TEAMS.reduce((a,t)=>{a[t]=[];return a;}, {});

async function sbFetchAll() {
  if (!window.sb) return null;
  const [{ data: players }, { data: scores }] = await Promise.all([
    window.sb.from("players").select("full_name, team, paid").order("full_name",{ascending:true}),
    window.sb.from("team_scores").select("team,wins,losses"),
  ]);
  return { players: players || [], scores: scores || [] };
}
async function sbUpsertPlayer({ full_name, team=null, paid=false }) {
  if (!window.sb) return;
  await window.sb.from("players").upsert({ full_name, team, paid });
}
async function sbDeletePlayer(full_name) {
  if (!window.sb) return;
  await window.sb.from("players").delete().eq("full_name", full_name);
}
async function sbUpdateScore(team, win, lose) {
  if (!window.sb) return;
  await window.sb.from("team_scores").upsert({ team, wins: win, losses: lose }, { onConflict: "team" });
}

/* ------------------------------------ UI ----------------------------------- */
function LoginPage({ onLogin }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [hideLogo, setHideLogo] = useState(false);
  const logoSrc = useMemo(() => {
    const envUrl = import.meta.env?.VITE_LOGO_URL;
    const globalUrl = typeof window !== "undefined" ? window.__APP_LOGO__ : undefined;
    return safeLogoSrc(envUrl, globalUrl);
  }, []);

  const submit = (e) => {
    e.preventDefault();
    if (u === storedUsername && p === storedPassword) onLogin(u);
    else alert("Invalid");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-200">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md flex flex-col items-center">
        {!hideLogo ? (
          <img src={logoSrc} alt="Logo" className="w-32 h-32 mb-6 object-contain" onError={() => setHideLogo(true)} />
        ) : <div className="w-32 h-32 mb-6 rounded-full bg-gray-100 grid place-items-center text-sm text-gray-500">No Logo</div>}
        <h1 className="text-2xl font-bold mb-6">Login</h1>
        <form onSubmit={submit} className="space-y-4 w-full">
          <input className="w-full border rounded px-3 py-2" placeholder="Username" value={u} onChange={e=>setU(e.target.value)} />
          <input className="w-full border rounded px-3 py-2" placeholder="Password" type="password" value={p} onChange={e=>setP(e.target.value)} />
          <button className="w-full bg-blue-600 text-white py-2 rounded">Login</button>
        </form>
      </div>
    </div>
  );
}

function PerpetualGymLeagueApp() {
  const { user, login, logout } = useAuthUser();
  return user ? <PerpetualGymLeague onLogout={logout} /> : <LoginPage onLogin={login} />;
}

function PerpetualGymLeague({ onLogout }) {
  const [individuals, setIndividuals] = useState([]);
  const [teams, setTeams] = useState(emptyTeams);
  const [paid, setPaid] = useState({});
  const [scores, setScores] = useState(TEAMS.reduce((a,t)=>{a[t]={win:0,lose:0};return a;},{}));
  const [newName, setNewName] = useState("");

  // confirm state – USE NAME (not index)
  const [confirmType, setConfirmType] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState(null);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  // edit state
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingValue, setEditingValue] = useState("");

  useEffect(() => {
    (async () => {
      if (!window.sb) return;
      const { players, scores: teamScores } = (await sbFetchAll()) || { players: [], scores: [] };

      setIndividuals(players.map(p=>p.full_name));
      const tmap = TEAMS.reduce((a,t)=>{a[t]=[];return a;}, {});
      players.forEach(p=>{ if(p.team && tmap[p.team]) tmap[p.team].push(p.full_name); });
      setTeams(tmap);
      setPaid(players.reduce((a,p)=>{a[p.full_name]=!!p.paid;return a;}, {}));

      const smap = TEAMS.reduce((a,t)=>{a[t]={win:0,lose:0};return a;}, {});
      (teamScores||[]).forEach(r=>{ if(smap[r.team]) smap[r.team]={win:r.wins||0,lose:r.losses||0}; });
      setScores(smap);
    })();
  }, []);

  const add = async (e) => {
    e.preventDefault();
    const v = newName.trim();
    if (!v) return;
    setIndividuals(prev=>prev.concat(v));
    setNewName("");
    if (window.sb) await sbUpsertPlayer({ full_name: v, team: null, paid: false });
  };

  const assign = async (name, team) => {
    setTeams(prev => {
      const copy = Object.fromEntries(Object.entries(prev).map(([k,arr])=>[k, arr.filter(m=>m!==name)]));
      if (team) copy[team] = [...(copy[team]||[]), name];
      return copy;
    });
    if (window.sb) await sbUpsertPlayer({ full_name: name, team, paid: !!paid[name] });
  };

  const markPaid = async (name) => {
    setPaid(prev => ({...prev, [name]: !prev[name]}));
    if (window.sb) await sbUpsertPlayer({ full_name: name, team: Object.keys(teams).find(t => teams[t].includes(name)) || null, paid: !paid[name] });
  };

  const updateScore = async (team, type, delta) => {
    setScores(prev => ({ ...prev, [team]: nextScore(prev[team], type, delta) }));
    const cur = scores[team] || { win:0, lose:0 };
    const nv = type==="win" ? { win: Math.max(0, cur.win+delta), lose: cur.lose } : { win: cur.win, lose: Math.max(0, cur.lose+delta) };
    if (window.sb) await sbUpdateScore(team, nv.win, nv.lose);
  };

  const startEditing = (i, current) => { setEditingIndex(i); setEditingValue(current); };
  const saveEdit = async (i) => {
    const v = editingValue.trim(); if (!v) return;
    const old = individuals[i];
    setIndividuals(prev => prev.map((n, idx) => (idx === i ? v : n)));
    setTeams(prev => {
      const copy = {};
      for (const k in prev) copy[k] = (prev[k]||[]).map(m => (m === old ? v : m));
      return copy;
    });
    setPaid(prev => {
      const ns = {...prev};
      if (prev[old]) ns[v] = true;
      delete ns[old];
      return ns;
    });
    setEditingIndex(null); setEditingValue("");
    if (window.sb) {
      await sbDeletePlayer(old);
      const t = Object.keys(teams).find(tt => (teams[tt]||[]).includes(v)) || null;
      await sbUpsertPlayer({ full_name: v, team: t, paid: !!paid[v] });
    }
  };

  // OPEN confirm for this name
  const requestDelete = (name) => {
    setConfirmType("deleteIndividual");
    setConfirmDeleteName(name);
    setAwaitingConfirm(true);
  };

  // CLEAR helpers
  const cancelConfirm = () => {
    setConfirmType(null);
    setConfirmDeleteName(null);
    setAwaitingConfirm(false);
  };

  const performConfirm = async () => {
    if (confirmType === "deleteIndividual" && confirmDeleteName) {
      const nameToDelete = confirmDeleteName;
      setIndividuals(prev => prev.filter(n => n !== nameToDelete));
      setTeams(prev => {
        const copy = {};
        for (const k in prev) copy[k] = (prev[k]||[]).filter(m => m !== nameToDelete);
        return copy;
      });
      setPaid(prev => { const ns={...prev}; delete ns[nameToDelete]; return ns; });
      if (window.sb) await sbDeletePlayer(nameToDelete);
    }
    cancelConfirm();
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex flex-col">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-lg p-6 flex-1">
        <h1 className="text-2xl font-bold mb-4 text-center">Perpetual Alumni Mini League</h1>

        <form onSubmit={add} className="flex gap-2 mb-4">
          <input className="flex-1 border rounded px-3 py-2" placeholder="Enter full name" value={newName} onChange={e=>setNewName(e.target.value)} />
          <button className="px-4 py-2 bg-blue-600 text-white rounded">Add</button>
        </form>

        <ol className="list-decimal list-inside space-y-2">
          {individuals.map((name, i) => {
            const assigned = Object.keys(teams).find(t => teams[t].includes(name)) || "";
            return (
              <li key={name} className="flex items-center gap-4">
                {editingIndex === i ? (
                  <>
                    <input className="border rounded px-2 py-1" value={editingValue} onChange={e=>setEditingValue(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveEdit(i)} autoFocus />
                    <button type="button" onClick={()=>saveEdit(i)} className="px-2 py-1 bg-green-600 text-white rounded">Save</button>
                    <button type="button" onClick={()=>{setEditingIndex(null); setEditingValue("");}} className="px-2 py-1 bg-gray-400 text-white rounded">Cancel</button>
                  </>
                ) : (
                  <span className="flex-1 font-medium">{name}{paid[name] && <span className="ml-2 text-green-600 font-semibold">(Paid)</span>}</span>
                )}

                <select className="border rounded px-2 py-1" value={assigned} onChange={e=>assign(name, e.target.value)}>
                  <option value="">No Team</option>
                  {TEAMS.map(t => <option key={t} value={t}>Team {t}</option>)}
                </select>

                {editingIndex === i ? null : (
                  <>
                    <button type="button" onClick={()=>setEditingIndex(i)||setEditingValue(name)} className="px-2 py-1 bg-yellow-500 text-white rounded">Edit</button>
                    <button type="button" onClick={()=>requestDelete(name)} className="px-2 py-1 bg-red-500 text-white rounded">Delete</button>
                    <button type="button" onClick={()=>markPaid(name)} className={`px-2 py-1 rounded ${paid[name] ? "bg-green-700" : "bg-green-500"} text-white`}>
                      {paid[name] ? "Unmark Paid" : "Mark Paid"}
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ol>

        {TEAMS.map(team => {
          const w = scores[team]?.win ?? 0;
          const l = scores[team]?.lose ?? 0;
          return (
            <div key={team}>
              <h2 className="text-xl font-semibold mt-6 mb-2">
                Team {team}
                <span className="ml-4 text-sm">(<span className="text-green-600">Win {w}</span> / <span className="text-red-600">Lose {l}</span>)</span>
              </h2>
              <div className="flex gap-2 mb-2">
                <button type="button" onClick={() => updateScore(team,"win",1)} className="px-2 py-1 border rounded">+W</button>
                <button type="button" onClick={() => updateScore(team,"win",-1)} className="px-2 py-1 border rounded">-W</button>
                <button type="button" onClick={() => updateScore(team,"lose",1)} className="px-2 py-1 border rounded">+L</button>
                <button type="button" onClick={() => updateScore(team,"lose",-1)} className="px-2 py-1 border rounded">-L</button>
              </div>
              <ul className="list-inside space-y-1">
                {(teams[team]||[]).length ? (teams[team]||[]).map((m, idx)=>(
                  <li key={m} className="flex items-center gap-2">
                    <span className="font-medium">{idx+1}.</span>
                    <span className="flex-1">{m}{paid[m] && <span className="ml-2 text-green-600 font-semibold">(Paid)</span>}</span>
                    <button type="button" onClick={()=>assign(m, "")} className="px-2 py-1 bg-red-500 text-white rounded">Remove</button>
                  </li>
                )) : <li className="text-gray-400">No players</li>}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="max-w-4xl mx-auto mt-4 text-center">
        <button type="button" onClick={onLogout} className="px-4 py-2 bg-red-600 text-white rounded">Logout</button>
      </div>

      {/* Confirm modal */}
      {confirmType === "deleteIndividual" && awaitingConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={cancelConfirm} />
          <div className="relative z-10 bg-white rounded-2xl shadow-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-3">Delete Player</h3>
            <p className="mb-4">Delete <span className="font-semibold">{confirmDeleteName}</span>?</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={cancelConfirm} className="px-4 py-2 border rounded">Cancel</button>
              <button type="button" onClick={performConfirm} className="px-4 py-2 bg-red-600 text-white rounded">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Export --------------------------------- */
export default function App() {
  return <PerpetualGymLeagueApp />;
}
