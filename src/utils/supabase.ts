import { createClient } from '@supabase/supabase-js';
import config from '../config/index.js';

if (!config.supabase.url || !config.supabase.serviceRoleKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'public',
    },
  }
);

export default supabase;
