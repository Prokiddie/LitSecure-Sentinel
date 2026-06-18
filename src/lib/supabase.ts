/// <reference types="vite/client" />
/**
 * LitSecure Sentinel — Supabase Client
 * Real-time connection to the national cyber database.
 *
 * Project: zzwknylbnfhpcgldravf
 * URL: https://zzwknylbnfhpcgldravf.supabase.co
 *
 * To activate:
 *   1. Go to https://supabase.com/dashboard/project/zzwknylbnfhpcgldravf/settings/api
 *   2. Copy your "anon/public" key
 *   3. Set VITE_SUPABASE_ANON_KEY in your .env.local
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || "https://zzwknylbnfhpcgldravf.supabase.co";
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

if (!SUPABASE_ANON) {
  console.warn(
    "[LitSecure] VITE_SUPABASE_ANON_KEY not set. " +
    "Real-time data will fall back to local API polling. " +
    "Get your key from: https://supabase.com/dashboard/project/zzwknylbnfhpcgldravf/settings/api"
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth:     { persistSession: true, autoRefreshToken: true },
  realtime: { params: { eventsPerSecond: 10 } },
});

export const isSupabaseConnected = () => Boolean(SUPABASE_ANON);
