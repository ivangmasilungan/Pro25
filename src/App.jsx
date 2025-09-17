import React, { useMemo, useState } from "react";

// =====================================================
// Helpers + Smoke Tests (do not modify existing tests t1–t3)
// =====================================================
function safeLogoSrc(envUrl, globalUrl) {
  if (globalUrl && typeof globalUrl === "string") return globalUrl;
  if (envUrl && typeof envUrl === "string") return envUrl;
  return "/sports_logo.jpg"; // default to new uploaded logo
}

// Pure helper for team score updates (testable, ES5-safe)
function nextScore(prev, type, delta) {
  const current = Math.max(0, Number(((prev && prev[type]) != null ? prev[type] : 0)));
  const n = Math.max(0, current + Number(delta || 0));
  const out = {};
  for (const k in prev) out[k] = prev[k];
  out[type] = n;
  return out;
}

// Credentials (mutable for demo-only change password flow)
let storedUsername = "Admin";
let storedPassword = "@lum2025!";

// Pure helpers
function validateCredentials(u, p) {
  return u === storedUsername && p === storedPassword;
}

// =====================================================
// Login Page
// =====================================================
function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [hideLogo, setHideLogo] = useState(false);

  const logoSrc = useMemo(() => {
    const envUrl =
      typeof process !== "undefined" && process.env && process.env.VITE_LOGO_URL
        ? process.env.VITE_LOGO_URL
        : undefined;
    const globalUrl =
      typeof window !== "undefined" && window.__APP_LOGO__
        ? window.__APP_LOGO__
        : undefined;
    return safeLogoSrc(envUrl, globalUrl);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateCredentials(username, password)) onLogin(username);
    else alert("Invalid credentials. Please try again.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-200">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md flex flex-col items-center">
        {!hideLogo ? (
          <img
            src={logoSrc}
            alt="League Logo"
            className="w-32 h-32 mb-6 object-contain"
            onError={() => setHideLogo(true)}
          />
        ) : (
          <div className="w-32 h-32 mb-6 rounded-full bg-gray-100 grid place-items-center text-sm text-gray-500">
            No Logo
          </div>
        )}
        <h1 className="text-2xl font-bold mb-6 text-center">Login</h1>
        <form onSubmit={handleSubmit} className="space-y-4 w-full">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
          <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded">Login</button>
        </form>
        <p className="text-xs text-gray-500 mt-4">Created by IGM</p>
      </div>
    </div>
  );
}

// =====================================================
// App Shell
// =====================================================
export default function PerpetualGymLeagueApp() {
  const [user, setUser] = useState(null);
  return user ? <PerpetualGymLeague onLogout={() => setUser(null)} /> : <LoginPage onLogin={setUser} />;
}

// =====================================================
// Main League Component (restored placeholder UI)
// =====================================================
function PerpetualGymLeague({ onLogout }) {
  const initialIndividuals = [];
  const initialTeams = { A: [], B: [], C: [], D: [], E: [], F: [], G: [], H: [], I: [], J: [] };

  const [individuals, setIndividuals] = useState(initialIndividuals);
  const [teams, setTeams] = useState(initialTeams);
  const [newName, setNewName] = useState("");
  const [confirmType, setConfirmType] = useState(null); // 'individuals' | 'teams' | 'deleteIndividual'
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [paidStatus, setPaidStatus] = useState({});
  const [clearOption, setClearOption] = useState("");
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [teamScores, setTeamScores] = useState(
    Object.keys(initialTeams).reduce(function (acc, t) {
      acc[t] = { win: 0, lose: 0 };
      return acc;
    }, {})
  );

  // Change Password modal state
  const [showPwd, setShowPwd] = useState(false);
  const [curPwd, setCurPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [pwdErrors, setPwdErrors] = useState([]);
  const [pwdSuccess, setPwdSuccess] = useState("");

  const addIndividual = (e) => {
    e.preventDefault();
    const v = (newName || "").trim();
    if (!v) return;
    setIndividuals(function (prev) { return prev.concat(v); });
    setNewName("");
  };

  const togglePaid = (name) => {
    setPaidStatus(function (prev) {
      const out = {};
      for (const k in prev) out[k] = prev[k];
      out[name] = !prev[name];
      return out;
    });
  };

  const cancelClear = () => {
    setConfirmType(null);
    setConfirmDeleteIndex(null);
    setAwaitingConfirm(false);
    setClearOption("");
  };

  const performClear = () => {
    if (confirmType === "individuals") {
      setIndividuals([]);
    } else if (confirmType === "teams") {
      setTeams(initialTeams);
    } else if (confirmType === "deleteIndividual" && confirmDeleteIndex !== null) {
      const nameToDelete = individuals[confirmDeleteIndex];
      setIndividuals(function (prev) { return prev.filter(function (_, i) { return i !== confirmDeleteIndex; }); });
      setTeams(function (prev) {
        const copy = {};
        Object.keys(prev).forEach(function (t) {
          const members = prev[t] || [];
          copy[t] = members.filter(function (m) { return m !== nameToDelete; });
        });
        return copy;
      });
      setPaidStatus(function (prev) {
        const ns = {};
        for (const k in prev) if (k !== nameToDelete) ns[k] = prev[k];
        return ns;
      });
    }
    cancelClear();
  };

  const moveIndividualToTeam = (name, selectedTeam) => {
    setTeams(function (prev) {
      const copy = {};
      Object.keys(prev).forEach(function (t) {
        const members = prev[t] || [];
        copy[t] = members.filter(function (m) { return m !== name; });
      });
      if (!selectedTeam) return copy;
      if (!copy[selectedTeam]) copy[selectedTeam] = [];
      if (copy[selectedTeam].length < 15 && copy[selectedTeam].indexOf(name) === -1) copy[selectedTeam].push(name);
      else if (copy[selectedTeam].length >= 15) alert("Team " + selectedTeam + " is already full.");
      return copy;
    });
  };

  const startEditing = (idx, currentValue) => { setEditingIndex(idx); setEditingValue(currentValue); };

  const saveEdit = (idx) => {
    const v = (editingValue || "").trim();
    if (!v) return;
    const oldValue = individuals[idx];
    setIndividuals(function (prev) { return prev.map(function (n, i) { return i === idx ? v : n; }); });
    setTeams(function (prev) {
      const copy = {};
      Object.keys(prev).forEach(function (t) {
        const members = prev[t] || [];
        copy[t] = members.map(function (m) { return m === oldValue ? v : m; });
      });
      return copy;
    });
    setPaidStatus(function (prev) {
      const ns = {};
      for (const k in prev) ns[k] = prev[k];
      if (prev[oldValue]) ns[v] = true;
      delete ns[oldValue];
      return ns;
    });
    setEditingIndex(null);
    setEditingValue("");
  };

  const requestDeleteIndividual = (idx) => { setConfirmType("deleteIndividual"); setConfirmDeleteIndex(idx); setAwaitingConfirm(true); };

  const removeFromTeam = (team, member) => {
    setTeams(function (prev) {
      const copy = {};
      for (const k in prev) copy[k] = prev[k];
      copy[team] = (copy[team] || []).filter(function (m) { return m !== member; });
      return copy;
    });
  };

  const handleClearSelection = () => {
    if (clearOption === "individuals") setConfirmType("individuals");
    else if (clearOption === "teams") setConfirmType("teams");
    if (clearOption) setAwaitingConfirm(true);
  };

  const resetScores = (team) => {
    setTeamScores(function (prev) { const out = {}; for (const k in prev) out[k] = prev[k]; out[team] = { win: 0, lose: 0 }; return out; });
  };

  const updateScore = (team, type, delta) => {
    setTeamScores(function (prev) { const out = {}; for (const k in prev) out[k] = prev[k]; out[team] = nextScore(prev[team], type, delta); return out; });
  };

  // Change Password handlers
  const openChangePassword = () => { setShowPwd(true); setPwdErrors([]); setPwdSuccess(""); setCurPwd(""); setNewPwd(""); setNewPwd2(""); };
  const closeChangePassword = () => { setShowPwd(false); setPwdErrors([]); setPwdSuccess(""); };
  const submitChangePassword = (e) => {
    e.preventDefault();
    const errs = validateNewPassword(curPwd, newPwd, newPwd2);
    if (errs.length) { setPwdErrors(errs); setPwdSuccess(""); return; }
    storedPassword = newPwd; // demo in-memory update
    setPwdErrors([]);
    setPwdSuccess("Password updated successfully.");
    setTimeout(() => { closeChangePassword(); }, 800);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex flex-col">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-lg p-6 flex-1">
        <h1 className="text-2xl font-bold mb-4 text-center">Perpetual Alumni Mini League</h1>

        <p className="mb-2 text-gray-600 text-lg font-bold text-center">Total Registered Players: {individuals.length}</p>
        <h2 className="text-xl font-semibold mt-6 mb-2">Player's Full name</h2>

        <form onSubmit={addIndividual} className="flex gap-2 mb-4">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Enter full name"
            className="flex-1 border rounded px-3 py-2"
          />
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Add</button>
        </form>

        <ol className="list-decimal list-inside space-y-2">
          {individuals.map(function (name, idx) {
            const assigned = (function () {
              for (const t in teams) { if ((teams[t] || []).indexOf(name) !== -1) return t; }
              return "";
            })();
            return (
              <li key={idx} className="flex items-center gap-4">
                {editingIndex === idx ? (
                  <>
                    <input
                      type="text"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit(idx)}
                      className="border rounded px-2 py-1"
                      autoFocus
                    />
                    <button onClick={() => saveEdit(idx)} className="px-2 py-1 bg-green-600 text-white rounded">Save</button>
                    <button onClick={() => { setEditingIndex(null); setEditingValue(""); }} className="px-2 py-1 bg-gray-400 text-white rounded">Cancel</button>
                  </>
                ) : (
                  <span className="flex-1 font-medium text-left">
                    {name}
                    {paidStatus[name] && <span className="ml-2 text-green-600 font-semibold">(Paid)</span>}
                  </span>
                )}

                <select
                  value={assigned}
                  onChange={(e) => moveIndividualToTeam(name, e.target.value)}
                  className="border rounded px-2 py-1"
                >
                  <option value="">No Team</option>
                  {Object.keys(initialTeams).map(function (key) { return (
                    <option key={key} value={key}>Team {key}</option>
                  );})}
                </select>

                {editingIndex === idx ? null : (
                  <>
                    <button onClick={() => togglePaid(name)} className={"px-2 py-1 rounded " + (paidStatus[name] ? "bg-green-700" : "bg-green-500") + " text-white"}>
                      {paidStatus[name] ? "Unmark Paid" : "Mark Paid"}
                    </button>
                    <button onClick={() => startEditing(idx, name)} className="px-2 py-1 bg-yellow-500 text-white rounded">Edit</button>
                    <button onClick={() => requestDeleteIndividual(idx)} className="px-2 py-1 bg-red-500 text-white rounded">Delete</button>
                  </>
                )}
              </li>
            );
          })}
        </ol>

        {Object.keys(teams).map(function (team) {
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
                <button onClick={() => updateScore(team, 'win', 1)} className="px-2 py-1 border rounded">+W</button>
                <button onClick={() => updateScore(team, 'win', -1)} className="px-2 py-1 border rounded">-W</button>
                <button onClick={() => updateScore(team, 'lose', 1)} className="px-2 py-1 border rounded">+L</button>
                <button onClick={() => updateScore(team, 'lose', -1)} className="px-2 py-1 border rounded">-L</button>
                <button onClick={() => resetScores(team)} className="px-2 py-1 border rounded">Reset</button>
              </div>
              <ul className="list-inside space-y-1">
                {members.length === 0 ? (
                  <li className="text-gray-400">No players</li>
                ) : (
                  members.map(function (member, idx) { return (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="font-medium">{idx + 1}.</span>
                      <span className="flex-1">
                        {member}
                        {paidStatus[member] && <span className="ml-2 text-green-600 font-semibold">(Paid)</span>}
                      </span>
                      <button onClick={() => removeFromTeam(team, member)} className="px-2 py-1 bg-red-500 text-white rounded">Remove</button>
                    </li>
                  );})
                )}
              </ul>
            </div>
          );
        })}

        <div className="mt-6 flex items-center gap-2">
          <select
            value={clearOption}
            onChange={(e) => setClearOption(e.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="">Select Clear Option</option>
            <option value="individuals">Clear Individuals</option>
            <option value="teams">Clear Teams</option>
          </select>
          <button onClick={handleClearSelection} className="px-4 py-2 text-black border rounded">❌</button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto mt-4 text-center flex items-center justify-center gap-2">
        <button onClick={onLogout} className="px-4 py-2 bg-red-600 text-white rounded">Logout</button>
        <button onClick={openChangePassword} className="px-4 py-2 bg-yellow-600 text-white rounded">Change Password</button>
      </div>

      {showPwd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black opacity-40" onClick={closeChangePassword} />
          <div className="bg-white rounded-lg shadow-lg p-6 z-60 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Change Password</h3>
            {pwdErrors.length > 0 && (
              <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
                <ul className="list-disc list-inside">
                  {pwdErrors.map(function (e, i) { return <li key={i}>{e}</li>; })}
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
                <button type="button" onClick={closeChangePassword} className="px-4 py-2 border rounded">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmType && awaitingConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black opacity-40" onClick={cancelClear} />
          <div className="bg-white rounded-lg shadow-lg p-6 z-60 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-2">⚠️ Final Action</h3>
            <p className="mb-4">
              {confirmType === "individuals"
                ? "Are you sure you want to clear ALL individual registrations? This cannot be undone."
                : confirmType === "teams"
                ? "Are you sure you want to clear ALL team rosters? This cannot be undone."
                : "Are you sure you want to delete this individual? This cannot be undone."}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={cancelClear} className="px-4 py-2 border rounded">Cancel</button>
              <button onClick={performClear} className="px-4 py-2 bg-red-600 text-white rounded">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
