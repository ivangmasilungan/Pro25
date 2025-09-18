// src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";

/** Read env injected by Vite (must start with VITE_) */
const url = import.meta.env?.VITE_SUPABASE_URL?.trim();
const key = import.meta.env?.VITE_SUPABASE_ANON_KEY?.trim();

/** Create client only when both values are present */
export const supabase = url && key ? createClient(url, key) : null;

/** Expose for quick console checks and log status */
if (typeof window !== "undefined") {
  window.sb = supabase || undefined;
  window.__SB_DEBUG__ = { url, keyPresent: !!key, keyLen: key ? key.length : 0 };
  console.log(`[sb] client ${supabase ? "created" : "NOT created"}`, window.__SB_DEBUG__);
}

/** Small ping used by the app to decide “online/local” */
export async function pingSupabase() {
  if (!supabase) throw new Error("client-not-created");
  const { error } = await supabase.from("players").select("*").limit(1);
  if (error) throw error;
  return true;
}
