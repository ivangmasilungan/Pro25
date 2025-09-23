
import React, { useState } from "react";
import AppOriginal from "./App.jsx";

/**
 * App.v2.jsx
 * UI shell + theme that WRAPS the original App without touching its logic.
 * - Maroon/White colorway
 * - Mobile-first, sticky header, collapsible sidebar
 * - Global, low-specificity CSS tokens to refresh buttons/inputs/cards
 * - Your original App renders inside <main className="v2-content"> unchanged.
 */
const V2Styles = () => (
  <style>{`
    :root{
      --m-900:#4a0000;
      --m-800:#5c0000;
      --m-700:#700000;
      --m-600:#800000; /* primary */
      --m-500:#9a2121;
      --m-100:#fde8e8;
      --bd:#e5e7eb;
      --tx:#111827;
      --mut:#6b7280;
      --bg:#ffffff;
    }
    *{box-sizing:border-box}
    html,body,#root{height:100%}
    body{margin:0;background:var(--bg);color:var(--tx);font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial}

    /* ---------- Layout Shell ---------- */
    .v2-shell{
      min-height:100vh;
      display:grid;
      grid-template-columns: 240px 1fr;
      grid-template-rows: auto 1fr auto;
      grid-template-areas:
        "aside header"
        "aside content"
        "aside footer";
      background:#fff;
    }
    @media (max-width: 960px){
      .v2-shell{ grid-template-columns: 1fr; grid-template-areas: "header" "content" "footer"; }
      .v2-aside{ display:none; }
      .v2-shell.nav-open .v2-aside{ display:block; position:fixed; inset:0 30% 0 0; z-index:50; }
      .v2-shell.nav-open .v2-scrim{ position:fixed; inset:0; background:rgba(17,24,39,.45); z-index:40; }
    }
    .v2-aside{
      grid-area:aside;
      border-right:1px solid var(--bd);
      padding:1rem;
      background:linear-gradient(0deg,#fff,#fff), var(--m-100);
    }
    .v2-brand{ font-weight:800; color:var(--m-700); margin-bottom:.6rem }
    .v2-nav a{
      display:block; text-decoration:none; color:#111;
      padding:.55rem .6rem; border-radius:10px; border:1px solid transparent;
    }
    .v2-nav a:hover{ background:var(--m-100); border-color:var(--m-100); color:var(--m-700) }

    .v2-header{
      grid-area:header;
      position:sticky; top:0; z-index:10;
      background:#fff; border-bottom:1px solid var(--bd);
      display:flex; align-items:center; justify-content:space-between;
      padding:.7rem 1rem;
    }
    .v2-title{ color:var(--m-700); font-weight:700 }
    .v2-actions{ display:flex; align-items:center; gap:.5rem }

    .v2-content{ grid-area:content; padding:1rem; }
    .v2-footer{
      grid-area:footer;
      border-top:1px solid var(--bd);
      padding:.7rem 1rem;
      color:var(--mut);
      display:flex; align-items:center; justify-content:space-between;
      background:#fff;
    }

    /* ---------- Generic Visual Refresh (low specificity) ---------- */
    button, .btn {
      min-height:2.5rem; padding:0 .9rem;
      border-radius:12px; border:1px solid transparent;
      font-weight:600; cursor:pointer;
    }
    .btn-primary, button.primary { background:var(--m-600); color:#fff }
    .btn-primary:hover, button.primary:hover { background:var(--m-700) }
    .btn-ghost, button.ghost { background:#fff; border:1px solid var(--bd) }
    .btn-danger, button.danger { background:#b91c1c; color:#fff }

    input[type="text"], input[type="number"], input[type="email"], input[type="password"],
    input[type="date"], select, textarea {
      border:1px solid var(--bd); border-radius:12px; background:#fff;
      padding:.55rem .8rem;
    }
    textarea{ min-height:6rem }

    .card, .panel, .box{
      background:#fff; border:1px solid var(--bd); border-radius:16px; box-shadow:0 1px 2px rgba(0,0,0,.05);
    }
    .card.v2-accent::before, .panel.v2-accent::before{
      content:""; display:block; height:4px; background:var(--m-600); opacity:.85;
      border-top-left-radius:16px; border-top-right-radius:16px;
    }
    .badge, .chip, .pill{ display:inline-flex; align-items:center; gap:.35rem; padding:.15rem .55rem; border-radius:9999px; border:1px solid var(--bd); font-size:.75rem; background:#fff }
    .badge-soft{ background:var(--m-100); color:var(--m-700); border-color:transparent }

    /* ---------- Helpers ---------- */
    .hide-on-desktop{ display:none }
    @media (max-width:960px){ .hide-on-desktop{ display:inline-flex } }
  `}</style>
);

/** Wrapper shell that hosts the original app. */
export default function AppV2(){
  const [navOpen, setNavOpen] = useState(false);
  return (
    <>
      <V2Styles />
      <div className={`v2-shell ${navOpen ? "nav-open" : ""}`}>
        {/* Mobile scrim when sidebar is open */}
        {navOpen && <div className="v2-scrim" onClick={()=>setNavOpen(false)} />}

        <aside className="v2-aside">
          <div className="v2-brand">OPS • v2</div>
          <nav className="v2-nav">
            <a href="#dash">Dashboard</a>
            <a href="#players">Players</a>
            <a href="#teams">Teams</a>
            <a href="#logs">Logs</a>
            <a href="#public">Public</a>
          </nav>
        </aside>

        <header className="v2-header">
          <div className="v2-title">Operations Console</div>
          <div className="v2-actions">
            <button className="btn btn-ghost hide-on-desktop" onClick={()=>setNavOpen(v=>!v)}>
              {navOpen ? "Close" : "Menu"}
            </button>
          </div>
        </header>

        <main className="v2-content">
          {/* Your existing app renders here, with ALL logic intact */}
          <AppOriginal />
        </main>

        <footer className="v2-footer">
          <span>UI v2 • Maroon/White</span>
          <span>Edgewalker Build</span>
        </footer>
      </div>
    </>
  );
}
