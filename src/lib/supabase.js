import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;

try {
  if (typeof url === "string" && url.startsWith("http") && typeof key === "string" && key.length > 20) {
    supabase = createClient(url, key);
    if (typeof window !== "undefined") window.sb = supabase;
  } else {
    if (typeof window !== "undefined") window.sb = undefined;
    console.warn("[supabase] Missing/invalid VITE_SUPABASE_* envs. Running in-memory.", { url, keyLen: key?.length ?? 0 });
  }
} catch (err) {
  console.error("[supabase] init failed:", err);
  if (typeof window !== "undefined") window.sb = undefined;
}

export { supabase };
