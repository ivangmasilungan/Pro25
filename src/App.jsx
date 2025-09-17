// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";

// ---------- Helpers ----------
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

// Demo credentials
let storedUsername = "Admin";
let storedPassword = "@lum2025!";

// ---------- Supabase-aware data helpers ----------
const TEAMS = ["A","B","C","D","E","F","G","H","I","J"];
const emptyTeams = TEAMS.reduce((acc,t)=>{acc[t]=[]; return acc;}, {});

async function sbFetchAll() {
  if (!window.sb) return null;
  const [{ data: players }, { data: scores }] = await Promise.all([
    window.sb.from("players").select("full_name, team, paid").order("full_name", { ascending: true }),
    window.sb.from("team_scores").select("team, wins, losses"),
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

// ---------- UI ----------
function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [hideLogo, setHideLogo] = useState(false);
  const logoSrc = useMemo(() => {
    const envUrl = import.meta.env?.VITE_LOGO_URL;
    const globalUrl = (typeof window !== "undefined" && window.__APP_LOGO__) ? window.__APP_LOGO__ : undefined;
    return safeLogoSrc(envUrl, globalUrl);
  }, []);
  const handleSubmit = (e) => {
    e.preventDefault();
    if (username === storedUsername && password === storedPassword) onLogin(username);
    else alert("Invalid credentials. Please try again.");
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-200">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md flex flex-col items-center">
        {!hideLogo ? (
          <img src={logoSrc} alt="League Logo" className="w-32 h-32 mb-6 object-contain" onError={() => setHideLogo(true)} />
        ) : (
          <div className="w-32 h-32 mb-6 rounded-full bg-gray-100 grid place-items-center text-sm text-gray-500">No Logo</div>
        )}
        <h1 className="text-2xl font-bold mb-6 text-center">Login</h1>
        <form onSubmit={handleSubmit} className="space-y-4 w-full">
          <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full border rounded px-3 py-2" />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded px-3 py-2" />
          <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded">Login</button>
        </form>
        <p className="text-xs text-gray-500 mt-4">Created by IGM</p>
      </div>
    </div>
  );
}

function PerpetualGymLeagueApp() {
  const [user, setUser] = useState(null);
  return user ? <PerpetualGymLeague onLogout={() => setUser(null)} /> : <LoginPage onLogin={setUser} />;
}

function PerpetualGymLeague({ onLogout }) {
  const [individuals, setIndividuals] = useState([]);
  const [teams, setTeams] = useState(emptyTeams);
  const [newName, setNewName] = useState("");
  const [confirmType, setConfirmType] = useState(null);
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [paidStatus, setPaidStatus] = useState({});
  const [clearOption, setClearOption] = useState("");
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [teamScores, setTeamScores] = useState(TEAMS.reduce((acc,t)=>{acc[t]={win:0,lose:0}; return acc;}, {}));

  const [showPwd, setShowPwd] = useState(false);
  const [curPwd, setCurPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [pwdErrors, setPwdErrors] = useState([]);
  const [pwdSuccess, setPwdSuccess] = useState("");

  useEffect(() => {
    (async () => {
      if (!window.sb) return; // in-memory mode if no Supabase
      const res = await sbFetchAll();
      if (!res) return;
      const { players, scores } = res;

      setIndividuals(players.map(p => p.full_name));
      const teamMap = TEAMS.reduce((acc,t)=>{acc[t]=[]; return acc;}, {});
      players.forEach(p => { if (p.team && teamMap[p.team]) teamMap[p.team].push(p.full_name); });
      setTeams(teamMap);
      setPaidStatus(players.reduce((acc,p)=>{acc[p.full_name]=!!p.paid; return acc;}, {}));

      const scoreMap = TEAMS.reduce((acc,t)=>{acc[t]={win:0,lose:0}; return acc;}, {});
      (scores||[]).forEach(row => {
        if (scoreMap[row.team]) scoreMap[row.team] = { win: row.wins||0, lose: row.losses||0 };
      });
      setTeamScores(scoreMap);
    })();
  }, []);

  function validateNewPassword(current, next1, next2) {
    const errs = [];
    if (current !== storedPassword) errs.push("Current password is incorrect.");
    if (!next1 || next1.length < 8) errs.push("New password must be at least 8 characters.");
    if (next1 !== next2) errs.push("Passwords do not match.");
    return errs;
  }

  const addIndividual = async (e) => {
    e.preventDefault();
    const v = (newName || "").trim();
    if (!v) return;
    setNewName("");
    setIndividuals(prev => prev.concat(v));
    if (window.sb) await sbUpsertPlayer({ full_name: v, team: null, paid: false });
  };

  const togglePaid = async (name) => {
    setPaidStatus(prev => ({ ...prev, [name]: !prev[name] }));
    if (window.sb) {
      const team = Object.keys(teams).find(t => (teams[t]||[]).includes(name)) || null;
      await sbUpsertPlayer({ full_name: name, team, paid: !paidStatus[name] });
    }
  };

  const cancelClear = () => {
    setConfirmType(null);
    setConfirmDeleteIndex(null);
    setAwaitingConfirm(false);
    setClearOption("");
  };

  const performClear = async () => {
    if (confirmType === "individuals") {
      if (window.sb) await window.sb.from("players").delete().neq("full_name", "");
      setIndividuals([]); setPaidStatus({}); setTeams(emptyTeams);
    } else if (confirmType === "teams") {
      const names = [...individuals];
      setTeams(emptyTeams);
      if (window.sb) for (const n of names) await sbUpsertPlayer({ full_name: n, team: null, paid: !!paidStatus[n] });
    } else if (confirmType === "deleteIndividual" && confirmDeleteIndex !== null) {
      const nameToDelete = individuals[confirmDeleteIndex];
      setIndividuals(prev => prev.filter((_, i) => i !== confirmDeleteIndex));
      setTeams(prev => {
        const copy = {};
        for (const k in prev) copy[k] = prev[k].filter(m => m !== nameToDelete);
        return copy;
      });
      setPaidStatus(prev => {
        const ns = { ...prev }; delete ns[nameToDelete]; return ns;
      });
      if (window.sb) await sbDeletePlayer(nameToDelete);
    }
    cancelClear();
  };

  const moveIndividualToTeam = async (name, selectedTeam) => {
    setTeams(prev => {
      const copy = {};
      Object.keys(prev).forEach(t => { copy[t] = (prev[t] || []).filter(m => m !== name); });
      if (selectedTeam) {
        copy[selectedTeam] = copy[selectedTeam] || [];
        if (copy[selectedTeam].length < 15 && !copy[selectedTeam].includes(name)) copy[selectedTeam].push(name);
        else if (copy[selectedTeam].length >= 15) alert("Team " + selectedTeam + " is already full.");
      }
      return copy;
    });
    if (window.sb) await sbUpsertPlayer({ full_name: name, team: selectedTeam || null, paid: !!paidStatus[name] });
  };

  const startEditing = (idx, currentValue) => { setEditingIndex(idx); setEditingValue(currentValue); };
  const saveEdit = async (idx) => {
    const v = (editingValue || "").trim(); if (!v) return;
    const oldValue = individuals[idx];
    setIndividuals(prev => prev.map((n, i) => (i === idx ? v : n)));
    setTeams(prev => {
      const copy = {};
      Object.keys(prev).forEach(t => { copy[t] = (prev[t] || []).map(m => (m === oldValue ? v : m)); });
      return copy;
    });
    setPaidStatus(prev => {
      const ns = { ...prev };
      if (prev[oldValue]) ns[v] = true;
      delete ns[oldValue];
      return ns;
    });
    setEditingIndex(null); setEditingValue("");
    if (window.sb) {
      await sbDeletePlayer(oldValue);
      const team = Object.keys(teams).find(t => (teams[t]||[]).includes(v)) || null;
      await sbUpsertPlayer({ full_name: v, team, paid: !!paidStatus[v] });
    }
  };

  const requestDeleteIndividual = (idx) => { setConfirmType("deleteIndividual"); setConfirmDeleteIndex(idx); setAwaitingConfirm(true); };

  const removeFromTeam = async (team, member) => {
    setTeams(prev => {
      const copy = { ...prev };
      copy[team] = (copy[team] || []).filter(m => m !== member);
      return copy;
    });
    if (window.sb) await sbUpsertPlayer({ full_name: member, team: null, paid: !!paidStatus[member] });
  };

  const handleClearSelection = () => {
    if (clearOption === "individuals") setConfirmType("individuals");
    else if (clearOption === "teams") setConfirmType("teams");
    if (clearOption) setAwaitingConfirm(true);
  };

  const resetScores = async (team) => {
    setTeamScores(prev => ({ ...prev, [team]: { win: 0, lose: 0 } }));
    if (window.sb) await sbUpdateScore(team, 0, 0);
  };

  const updateScore = async (team, type, delta) => {
    setTeamScores(prev => ({ ...prev, [team]: nextScore(prev[team], type, delta) }));
    const cur = teamScores[team] || { win:0, lose:0 };
    const nv = type==="win" ? { win: Math.max(0, cur.win+delta), lose: cur.lose } : { win: cur.win, lose: Math.max(0, cur.lose+delta) };
    if (window.sb) await sbUpdateScore(team, nv.win, nv.lose);
  };

  const openChangePassword = () => { setShowPwd(true); setPwdErrors([]); setPwdSuccess(""); setCurPwd(""); setNewPwd(""); setNewPwd2(""); };
  const closeChangePassword = () => { setShowPwd(false); setPwdErrors([]); setPwdSuccess(""); };
  const submitChangePassword = (e) => {
    e.preventDefault();
    const errs = validateNewPassword(curPwd, newPwd, newPwd2);
    if (errs.length) { setPwdErrors(errs); setPwdSuccess(""); return; }
    storedPassword = newPwd;
    setPwdErrors([]); setPwdSuccess("Password updated successfully.");
    setTimeout(() => { closeChangePassword(); }, 800);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex flex-col">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-lg p-6 flex-1">
        <h1 className="text-2xl font-bold mb-4 text-center">Perpetual Alumni Mini League</h1>

        <p className="mb-2 text-gray-600 text-lg font-bold text-center">Total Registered Players: {individuals.length}</p>
        <h2 className="text-xl font-semibold mt-6 mb-2">Player&apos;s Full name</h2>

        <form onSubmit={addIndividual} className="flex gap-2 mb-4">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Enter full name" className="flex-1 border rounded px-3 py-2" />
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Add</button>
        </form>

        <ol className="list-decimal list-inside space-y-2">
          {individuals.map((name, idx) => {
            const assigned = Object.keys(teams).find(t => (teams[t]||[]).includes(name)) || "";
            return (
              <li key={idx} className="flex items-center gap-4">
                {editingIndex === idx ? (
                  <>
                    <input type="text" value={editingValue} onChange={(e) => setEditingValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEdit(idx)} className="border rounded px-2 py-1" autoFocus />
                    <button onClick={() => saveEdit(idx)} className="px-2 py-1 bg-green-600 text-white rounded">Save</button>
                    <button onClick={() => { setEditingIndex(null); setEditingValue(""); }} className="px-2 py-1 bg-gray-400 text-white rounded">Cancel</button>
                  </>
                ) : (
                  <span className="flex-1 font-medium text-left">
                    {name}
                    {paidStatus[name] && <span className="ml-2 text-green-600 font-semibold">(Paid)</span>}
                  </span>
                )}

                <select value={assigned} onChange={(e) => moveIndividualToTeam(name, e.target.value)} className="border rounded px-2 py-1">
                  <option value="">No Team</option>
                  {TEAMS.map((key) => <option key={key} value={key}>Team {key}</option>)}
                </select>

                {editingIndex === idx ? null : (
                  <>
                    <button onClick={() => togglePaid(name)} className={`px-2 py-1 rounded ${paidStatus[name] ? "bg-green-700" : "bg-green-500"} text-white`}>
                      {paidStatus[name] ? "Unmark Paid" : "Mark Paid"}
                    </button>
                    <button onClick={() => startEditing(idx, name)} className="px-2 py-1 bg-yellow-500 text-white rounded">Edit</button>
                    <button onClick={() => { setConfirmType("deleteIndividual"); setConfirmDeleteIndex(idx); setAwaitingConfirm(true); }} className="px-2 py-1 bg-red-500 text-white rounded">Delete</button>
                  </>
                )}
              </li>
            );
          })}
        </ol>

        {Object.keys(teams).map((team) => {
          const members = teams[team] || [];
          return (
            <div key={team}>
              <h2 className="text-xl font-semibold mt-6 mb-2">
                Team {team}
                <span className="ml-4 text-sm">
                  (<span className="text-green-600">Win {teamScores[team].win}</span> / <span className="text-red-600">Lose {teamScores[team].lose}</span>)
                </span>
              </h2>
              <div className="flex gap-2 mb-2">
                <button onClick={() => updateScore(team, "win", 1)} className="px-2 py-1 border rounded">+W</button>
                <button onClick={() => updateScore(team, "win", -1)} className="px-2 py-1 border rounded">-W</button>
                <button onClick={() => updateScore(team, "lose", 1)} className="px-2 py-1 border rounded">+L</button>
                <button onClick={() => updateScore(team, "lose", -1)} className="px-2 py-1 border rounded">-L</button>
                <button onClick={() => resetScores(team)} className="px-2 py-1 border rounded">Reset</button>
              </div>
              <ul className="list-inside space-y-1">
                {members.length === 0 ? (
                  <li className="text-gray-400">No players</li>
                ) : (
                  members.map((member, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="font-medium">{idx + 1}.</span>
                      <span className="flex-1">
                        {member}
                        {paidStatus[member] && <span className="ml-2 text-green-600 font-semibold">(Paid)</span>}
                      </span>
                      <button onClick={() => removeFromTeam(team, member)} className="px-2 py-1 bg-red-500 text-white rounded">Remove</button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          );
        })}

        <div className="mt-6 flex items-center gap-2">
          <select value={clearOption} onChange={(e) => setClearOption(e.target.value)} className="border rounded px-3 py-2">
            <option value="">Select Clear Option</option>
            <option value="individuals">Clear Individuals</option>
            <option value="teams">Clear Teams</option>
          </select>
          <button onClick={handleClearSelection} className="px-4 py-2 text-black border rounded">❌</button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto mt-4 text-center flex items-center justify-center gap-2">
        <button onClick={onLogout} className="px-4 py-2 bg-red-600 text-white rounded">Logout</button>
        <button onClick={() => setShowPwd(true)} className="px-4 py-2 bg-yellow-600 text-white rounded">Change Password</button>
      </div>

      {showPwd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black opacity-40" onClick={() => setShowPwd(false)} />
          <div className="bg-white rounded-lg shadow-lg p-6 z-60 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Change Password</h3>
            {pwdErrors.length > 0 && (
              <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
                <ul className="list-disc list-inside">
                  {pwdErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            {pwdSuccess && (
              <div className="mb-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">{pwdSuccess}</div>
            )}
            <form onSubmit={submitChangePassword} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Current Password</label>
                <input type="password" value={curPwd} onChange={(e) => setCurPwd(e.target.value)} className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">New Password</label>
                <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Confirm New Password</label>
                <input type="password" value={newPwd2} onChange={(e) => setNewPwd2(e.target.value)} className="w-full border rounded px-3 py-2" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowPwd(false)} className="px-4 py-2 border rounded">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmType && awaitingConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black opacity-40" onClick={() => {
            setConfirmType(null); setConfirmDeleteIndex(null); setAwaitingConfirm(false); setClearOption("");
          }} />
          <div className="bg-white rounded-lg shadow-lg p-6 z-60 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-2">Final Action</h3>
            <p className="mb-4">
              {confirmType === "individuals"
                ? "Clear ALL individual registrations?"
                : confirmType === "teams"
                ? "Clear ALL team rosters?"
                : "Delete this individual?"}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => {
                setConfirmType(null); setConfirmDeleteIndex(null); setAwaitingConfirm(false); setClearOption("");
              }} className="px-4 py-2 border rounded">Cancel</button>
              <button onClick={performClear} className="px-4 py-2 bg-red-600 text-white rounded">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Default export used by main.jsx
export default function App() {
  return <PerpetualGymLeagueApp />;
}
