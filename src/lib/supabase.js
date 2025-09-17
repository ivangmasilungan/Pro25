// src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;
if (url && key) {
  supabase = createClient(url, key);
  if (typeof window !== "undefined") window.sb = supabase;
} else {
  if (typeof window !== "undefined") window.sb = undefined; // in-memory/localStorage mode
}

export { supabase };
