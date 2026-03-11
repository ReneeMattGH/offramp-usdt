import supabase from '../utils/supabase.js';
import config from '../config/index.js';

export class PayoutProvider {
  async initiatePayout(order: any, user: any, bank: any) {
    console.log(`[PAYOUT_PROVIDER] Manual payout required for order ${order.id}`);
    
    // In manual mode, we just return PROCESSING and wait for admin to mark as COMPLETED
    return {
      status: 'PROCESSING',
      reason: 'Manual payout required',
      payout_id: `MANUAL_${order.id}`,
      raw: { mode: 'MANUAL' }
    };
  }
}
