import React from "react";
import AppOriginal from "./App.jsx";

/** ====== LULU SKIN: Global CSS overlay (maroon/white), zero logic changes ====== */
const SkinStyles = () => (
  <style>{`
    :root{
      --maroon-900:#4a0000;
      --maroon-800:#5c0000;
      --maroon-700:#700000;
      --maroon-600:#800000;
      --maroon-500:#9a2121;
      --maroon-100:#fde8e8;
      --border:#e5e7eb;
      --text:#111827;
      --muted:#6b7280;
      --bg:#ffffff;
    }

    /* Base look & feel */
    html, body, #root { height: 100%; }
    body{ margin:0; background: var(--bg); color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }

    /* Headings refresh */
    h1,h2,h3,h4,h5,h6{ color: var(--maroon-700) !important; letter-spacing: .2px; }
    h1{ font-size: 1.5rem; } h2{ font-size:1.25rem; } h3{ font-size:1.125rem; }

    /* Buttons: compact, rounded, maroon primary */
    button, .btn {
      min-height: 2.5rem;
      padding: 0 .9rem;
      border-radius: 12px !important;
      border: 1px solid transparent;
      font-weight: 600;
      cursor: pointer;
    }
    button.primary, .btn-primary { background: var(--maroon-600) !important; color: #fff !important; }
    button.primary:hover, .btn-primary:hover { background: var(--maroon-700) !important; }
    .btn-ghost, button.ghost { background: #fff !important; border: 1px solid var(--border) !important; color: var(--text) !important; }
    .btn-danger, button.danger { background: #b91c1c !important; color: #fff !important; }

    /* Inputs */
    input[type="text"], input[type="number"], input[type="email"],
    input[type="password"], input[type="date"], select, textarea {
      border: 1px solid var(--border) !important;
      border-radius: 12px !important;
      background: #fff !important;
      padding: .55rem .8rem !important;
    }
    textarea{ min-height: 6rem; }

    /* Cards / panels */
    .card, .panel, .box {
      background: #fff !important;
      border: 1px solid var(--border) !important;
      border-radius: 16px !important;
      box-shadow: 0 1px 2px rgba(0,0,0,.05) !important;
    }
    /* Soft maroon accent bar */
    .card::before, .panel::before {
      content: "";
      display: block;
      height: 4px;
      width: 100%;
      background: var(--maroon-600);
      opacity: .85;
      border-top-left-radius: 16px;
      border-top-right-radius: 16px;
    }

    /* Chips / badges */
    .badge, .chip, .pill {
      display:inline-flex; align-items:center; gap:.35rem;
      padding:.15rem .55rem; border-radius:9999px;
      border:1px solid var(--border);
      font-size:.75rem;
      background:#fff;
    }
    .badge-soft{ background: var(--maroon-100) !important; color: var(--maroon-700) !important; border-color: transparent !important; }

    /* Row items */
    .list-row { display:flex; align-items:center; justify-content:space-between; padding:.5rem .6rem; border-radius:12px; }
    .list-row:hover { background:#f9fafb; }

    /* Layout polish (generic containers your app likely already uses) */
    .container, .wrapper, .content { padding: 1rem; }
    @media (min-width: 640px){ .container, .wrapper, .content { padding: 1.25rem; } }
    @media (min-width: 1024px){ .container, .wrapper, .content { padding: 1.5rem; } }

    /* Compact gaps */
    .gap-4{ gap: .75rem !important; }
    .mb-6{ margin-bottom: 1rem !important; }
    .p-6{ padding: 1rem !important; }
    .p-8{ padding: 1.25rem !important; }
  `}</style>
);

export default function AppSkinned(){
  return (
    <>
      <SkinStyles />
      <AppOriginal />
    </>
  );
}
