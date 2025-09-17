import "./lib/supabase.js"; // this sets window.sb safely
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

console.log("[main] loaded, window.sb =", typeof window !== "undefined" ? !!window.sb : "n/a");
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
