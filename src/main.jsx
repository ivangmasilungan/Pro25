import "./lib/supabase.js";      // sets window.sb
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";            // ok if empty or Tailwind

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
