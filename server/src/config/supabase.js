import { createClient } from '@supabase/supabase-js';
import { env, validateSupabaseConfig } from './env.js';

let supabaseClient = null;

export function getSupabase() {
  if (!supabaseClient) {
    validateSupabaseConfig();
    supabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseClient;
}
