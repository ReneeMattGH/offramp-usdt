import supabase from '../utils/supabase.js';
import { PayoutProvider } from '../services/payoutProvider.js';
import wsService from '../services/wsService.js';

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
          // Add a small delay between orders to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 2000));
          
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

            wsService.sendToUser(order.user_id, 'PAYOUT_COMPLETED', {
              orderId: order.id,
              amount: order.amount,
              utr: (result as any).utr || result.payout_id
            });
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

            wsService.sendToUser(order.user_id, 'PAYOUT_FAILED', {
              orderId: order.id,
              reason: result.reason
            });
          }
        } catch (innerErr: any) {
          if (innerErr.message?.includes('ECONNRESET') || innerErr.message?.includes('fetch failed')) {
            console.warn(`[PAYOUT_WORKER] Network reset detected. Retrying next cycle for order ${order.id}`);
            // Don't update status, let it stay in APPROVED to retry next loop
          } else {
            console.error(`[PAYOUT_WORKER] Inner error for order ${order.id}:`, innerErr.message);
          }
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
