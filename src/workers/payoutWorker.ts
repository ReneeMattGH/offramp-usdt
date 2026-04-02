import supabase from '../utils/supabase.js';
import { PayoutProvider } from '../services/payoutProvider.js';

export class PayoutWorker {
  private static instance: PayoutWorker;
  private isProcessing: boolean = false;
  private timer: NodeJS.Timeout | null = null;
  private provider: PayoutProvider;

  private constructor() {
    this.provider = new PayoutProvider();
  }

  public static getInstance(): PayoutWorker {
    if (!PayoutWorker.instance) {
      PayoutWorker.instance = new PayoutWorker();
    }
    return PayoutWorker.instance;
  }

  public start() {
    console.log('[PAYOUT_WORKER] Starting payout queue processor...');
    this.timer = setInterval(() => this.processQueue(), 10000);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Find orders that are approved
      const { data: orders, error } = await supabase
        .from('payout_orders')
        .select('*, users(*), bank_accounts(*)')
        .eq('status', 'APPROVED')
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (!orders || orders.length === 0) return;

      for (const order of orders) {
        console.log(`[PAYOUT_WORKER] Processing payout order: ${order.id}`);

        // Mark as processing
        await supabase
          .from('payout_orders')
          .update({ status: 'PROCESSING', updated_at: new Date().toISOString() })
          .eq('id', order.id);

        try {
          const result = await this.provider.initiatePayout(order, order.users, order.bank_accounts);
          
          if (result.status === 'SUCCESS') {
            await supabase
              .from('payout_orders')
              .update({ 
                status: 'COMPLETED', 
                gateway_ref_id: (result as any).utr || result.payout_id,
                updated_at: new Date().toISOString()
              })
              .eq('id', order.id);
            console.log(`[PAYOUT_WORKER] Payout order ${order.id} completed successfully`);
          } else if (result.status === 'FAILED') {
            await supabase
              .from('payout_orders')
              .update({ 
                status: 'FAILED', 
                failure_reason: result.reason,
                updated_at: new Date().toISOString()
              })
              .eq('id', order.id);
            console.error(`[PAYOUT_WORKER] Payout order ${order.id} failed: ${result.reason}`);
          }
        } catch (innerErr: any) {
          console.error(`[PAYOUT_WORKER] Inner error for order ${order.id}:`, innerErr.message);
          // Mark back to approved or failed if it's a persistent error
        }
      }
    } catch (err) {
      console.error('[PAYOUT_WORKER] Error in queue processor:', err);
    } finally {
      this.isProcessing = false;
    }
  }
}

export default PayoutWorker.getInstance();
