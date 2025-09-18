// src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";

// Values come from Vite env (local .env and Vercel env)
const url = import.meta.env?.VITE_SUPABASE_URL?.trim();
const key = import.meta.env?.VITE_SUPABASE_ANON_KEY?.trim();

// Create client only if both are present
export const supabase = url && key ? createClient(url, key) : null;

// Expose for console testing
if (typeof window !== "undefined") {
  window.sb = supabase || undefined;
  console.log(`[sb] client ${supabase ? "created" : "NOT created"}`, {
    url,
    keyPresent: !!key,
    keyLen: key ? key.length : 0,
  });
}
