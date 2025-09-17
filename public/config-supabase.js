// public/config-supabase.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ↓↓↓ paste your real values ↓↓↓
const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndveWxiaGV3cWV6Y3FrbWdmeGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMDk1MjYsImV4cCI6MjA3MzY4NTUyNn0.fRnVrVsMbp9-yhyHDX2AcjyOY8pcLUacSJpH2_vdfts";
// ↑↑↑ paste your real values ↑↑↑

if (SUPABASE_URL.includes(".supabase.co") && SUPABASE_ANON_KEY.length > 20) {
  window.sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.warn("[config-supabase] placeholders detected; running in in-memory mode");
}
