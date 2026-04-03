import { createClient } from '@supabase/supabase-js';
import config from '../config/index.js';

if (!config.supabase.url || !config.supabase.serviceRoleKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * Custom fetch wrapper with intelligent retry and circuit breaker logic.
 * Prevents "Retry Storms" when Supabase limits are exceeded.
 */
const customFetch = async (input: string | URL | Request, init?: RequestInit) => {
  let retries = 2; // Reduced from 3 to minimize egress impact
  let delay = 3000;

  while (retries >= 0) {
    try {
      const response = await fetch(input, init);
      
      // If we get a 522 (Connection Timed Out), 504, or 429 (Rate Limit)
      if ([522, 504, 502, 429].includes(response.status)) {
        if (retries === 0) return response;
        
        console.warn(`[SUPABASE_FETCH] HTTP ${response.status} detected. Retrying in ${delay}ms...`);
        await new Promise(res => setTimeout(res, delay));
        retries--;
        delay *= 2; // Exponential backoff
        continue;
      }
      
      return response;
    } catch (err: any) {
      // If the error is a socket closure or fetch failure, only retry if it's not a persistent network issue
      const isSocketError = err.message?.includes('socket') || err.message?.includes('fetch failed');
      
      if (isSocketError && retries > 0) {
        console.warn(`[SUPABASE_FETCH] Socket error detected. Retrying in ${delay}ms...`);
        await new Promise(res => setTimeout(res, delay));
        retries--;
        delay *= 2;
        continue;
      }
      throw err;
    }
  }
  throw new Error('Supabase request failed after optimized retries');
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
