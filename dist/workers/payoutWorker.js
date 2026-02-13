import supabase from '../utils/supabase.js';
import { RazorpayProvider } from '../services/payoutProvider.js';
export class PayoutWorker {
    static instance;
    isProcessing = false;
    timer = null;
    provider;
    constructor() {
        this.provider = new RazorpayProvider();
    }
    static getInstance() {
        if (!PayoutWorker.instance) {
            PayoutWorker.instance = new PayoutWorker();
        }
        return PayoutWorker.instance;
    }
    start() {
        console.log('[PAYOUT_WORKER] Starting payout queue processor...');
        this.timer = setInterval(() => this.processQueue(), 10000);
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    async processQueue() {
        if (this.isProcessing)
            return;
        this.isProcessing = true;
        try {
            // Find orders that are approved but not yet processed
            const { data: order, error } = await supabase
                .from('payout_orders')
                .select('*, users(*), bank_accounts(*)')
                .eq('status', 'APPROVED')
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle();
            if (error)
                throw error;
            if (!order)
                return;
            console.log(`[PAYOUT_WORKER] Processing payout order: ${order.id}`);
            // Mark as processing
            await supabase
                .from('payout_orders')
                .update({ status: 'PROCESSING', updated_at: new Date().toISOString() })
                .eq('id', order.id);
            const result = await this.provider.initiatePayout(order, order.users, order.bank_accounts);
            if (result.status === 'SUCCESS') {
                await supabase
                    .from('payout_orders')
                    .update({
                    status: 'COMPLETED',
                    gateway_ref_id: result.utr || result.payout_id,
                    updated_at: new Date().toISOString()
                })
                    .eq('id', order.id);
                console.log(`[PAYOUT_WORKER] Payout order ${order.id} completed successfully`);
            }
            else if (result.status === 'FAILED') {
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
            // If status is PROCESSING, we wait for webhook or manual check
        }
        catch (err) {
            console.error('[PAYOUT_WORKER] Error in queue processor:', err);
        }
        finally {
            this.isProcessing = false;
        }
    }
}
export default PayoutWorker.getInstance();
//# sourceMappingURL=payoutWorker.js.map