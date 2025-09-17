// config-supabase.js
// 1) Replace the placeholders below with your real Supabase values.
// 2) Commit this file to GitHub (keys are safe to expose as 'anon' keys).
// 3) Deployed on Vercel, this static file will be served as-is.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co"; // <-- CHANGE ME
const SUPABASE_ANON_KEY = "YOUR_ANON_PUBLIC_KEY";            // <-- CHANGE ME

if (SUPABASE_URL.startsWith("https://YOUR_") || SUPABASE_ANON_KEY.startsWith("YOUR_")) {
  console.warn("[config-supabase] Using placeholder keys. window.sb will be undefined until you set real values.");
} else {
  window.sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
