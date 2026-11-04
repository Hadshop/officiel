// Configuration Supabase
const SUPABASE_URL = "https://imdzzgddztzvtehqrcmu.supabase.co";
const SUPABASE_KEY = "sb_publishable_HNqA5vql1ByTg605I0GZtg_pS1UalsN";

// Client Supabase (chargé via CDN dans les pages HTML)
// On utilise window.supabase.createClient
window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);