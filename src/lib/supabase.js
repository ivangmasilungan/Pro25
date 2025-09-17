// src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;

try {
  if (url && key) {
    supabase = createClient(url, key);
    if (typeof window !== "undefined") window.sb = supabase;   // used by App.jsx
  } else {
    if (typeof window !== "undefined") window.sb = undefined;  // run in-memory
    console.warn("[supabase] Missing VITE_SUPABASE_* envs. Running in-memory.");
  }
} catch (err) {
  console.error("[supabase] init failed:", err);
  if (typeof window !== "undefined") window.sb = undefined;
}

export { supabase };
