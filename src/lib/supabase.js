// src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";

// Read from Vite/Vercel env
const url = import.meta.env?.VITE_SUPABASE_URL?.trim();
const key = import.meta.env?.VITE_SUPABASE_ANON_KEY?.trim();

// Create client if both exist
export const supabase = url && key ? createClient(url, key) : null;

// Expose for console testing in browser
if (typeof window !== "undefined") {
  window.sb = supabase || undefined;
  window.__SB_DEBUG__ = { url, keyPresent: !!key, keyLen: key ? key.length : 0 };
  console.log(`[sb] client ${supabase ? "created" : "NOT created"}`, window.__SB_DEBUG__);
}
