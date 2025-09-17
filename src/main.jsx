import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./lib/supabase.js"; // ← IMPORTANT: load client (sets window.sb)
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
