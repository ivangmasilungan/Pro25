// src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env?.VITE_SUPABASE_URL?.trim();
const key = import.meta.env?.VITE_SUPABASE_ANON_KEY?.trim();

export const supabase = url && key ? createClient(url, key) : null;

if (typeof window !== "undefined") {
  window.sb = supabase || undefined;
  window.__SB_DEBUG__ = { url, keyPresent: !!key, keyLen: key ? key.length : 0 };
  console.log(`[sb] client ${supabase ? "created" : "NOT created"}`, window.__SB_DEBUG__);
}
