import { createClient } from '@supabase/supabase-js';
import config from '../config/index.js';

if (!config.supabase.url || !config.supabase.serviceRoleKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * Custom fetch wrapper with retry logic to handle intermittent 522/504 errors
 * from Supabase/Cloudflare.
 */
const customFetch = async (input: string | URL | Request, init?: RequestInit) => {
  let retries = 3;
  let lastError;

  while (retries > 0) {
    try {
      const response = await fetch(input, init);
      
      // If we get a 522 (Connection Timed Out) or 504 (Gateway Timeout), retry
      if (response.status === 522 || response.status === 504 || response.status === 502) {
        console.warn(`[SUPABASE_FETCH] Received HTTP ${response.status}. Retrying... (${retries} left)`);
        retries--;
        await new Promise(res => setTimeout(res, 2000)); // Wait 2s before retry
        continue;
      }
      
      return response;
    } catch (err) {
      lastError = err;
      retries--;
      console.warn(`[SUPABASE_FETCH] Network error. Retrying... (${retries} left)`, err);
      await new Promise(res => setTimeout(res, 2000));
    }
  }
  
  throw lastError || new Error(`Failed after 3 retries with HTTP 522/5xx`);
};

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
    global: {
      fetch: customFetch
    }
  }
);

export default supabase;
