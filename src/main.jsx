import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./lib/supabase.js";   // sets window.sb
import "./index.css";

console.log("[boot] mounting App");
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
