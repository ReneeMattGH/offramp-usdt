const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const RazorpayProvider = require('./payoutProvider');

class PayoutService {
    constructor() {
        this.isProcessing = false;
        this.isPaused = false;
        this.provider = new RazorpayProvider();
    }

    setPaused(paused) {
        this.isPaused = paused;
        console.log(`[Payout] System ${paused ? 'PAUSED' : 'RESUMED'}`);
    }

    startWorker() {
        console.log('Starting Payout Worker...');
        setInterval(() => this.processQueue(), 5000); // Check every 5 seconds
        setInterval(() => this.checkStuckOrders(), 60000); // Check for stuck orders every minute
    }

    async checkStuckOrders() {
        try {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            
            const { data: stuckOrders, error } = await supabase
                .from('exchange_orders')
                .select('id')
                .eq('status', 'PROCESSING')
                .lt('updated_at', fiveMinutesAgo);

            if (error) throw error;

            if (stuckOrders && stuckOrders.length > 0) {
                console.log(`Found ${stuckOrders.length} stuck orders. Marking as STUCK.`);
                
                const ids = stuckOrders.map(o => o.id);
                
                const { error: updateError } = await supabase
                    .from('exchange_orders')
                    .update({ status: 'STUCK', updated_at: new Date() })
                    .in('id', ids);

                if (updateError) throw updateError;
            }
        } catch (error) {
            console.error('Error checking stuck orders:', error);
        }
    }

    async processQueue() {
        if (this.isProcessing || this.isPaused) return;
        this.isProcessing = true;

        try {
            // 1. Fetch oldest PENDING order
            const { data: order, error } = await supabase
                .from('exchange_orders')
                .select('*, users(id, account_holder_name, account_number, ifsc_code, razorpay_contact_id, razorpay_fund_account_id)')
                .eq('status', 'PENDING')
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle();

            if (error) throw error;
            if (!order) {
                this.isProcessing = false;
                return; // Queue empty
            }

            console.log(`Processing Order ${order.id} for ${order.inr_amount} INR`);

            // 2. Mark as PROCESSING (to prevent other workers picking it up if scaled)
            const { error: updateError } = await supabase
                .from('exchange_orders')
                .update({ status: 'PROCESSING', updated_at: new Date() })
                .eq('id', order.id);

            if (updateError) throw updateError;

            // 3. Execute Bank Transfer
            const bankResponse = await this.executeBankTransfer(order);

            // 4. Handle Response
            await this.handleBankResponse(order.id, bankResponse);

        } catch (error) {
            if (error.code === 'PGRST205' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
                 // Suppress missing table error to avoid spamming logs
                 // console.warn('Payout Worker: Table missing (waiting for migrations)');
            } else {
                console.error('Payout Worker Error:', error);
            }
        } finally {
            this.isProcessing = false;
        }
    }

    async executeBankTransfer(order) {
        // Log Request
        await this.logPayout(order.id, 'RAZORPAY', {
            amount: order.inr_amount,
            account: order.users.account_number
        }, null, 'REQUEST');

        console.log(`[Bank API] Initiating Transfer of ₹${order.inr_amount} to ${order.users.account_number}`);

        const response = await this.provider.initiatePayout(order, order.users);
        
        // Log Response
        await this.logPayout(order.id, 'RAZORPAY', null, response.raw, response.status);

        return response;
    }

    async handleBankResponse(orderId, response) {
        console.log(`[Bank API] Response for ${orderId}:`, response);

        if (response.status === 'SUCCESS') {
            const { error } = await supabase.rpc('settle_exchange_order', {
                p_order_id: orderId,
                p_bank_reference: response.utr || 'MOCK_UTR',
                p_payout_reference_id: response.payout_id || 'MOCK_PID'
            });
            if (error) console.error('Settlement Error:', error);

        } else if (response.status === 'FAILED') {
            // Check Retry Logic
            try {
                const { data: order } = await supabase.from('exchange_orders').select('retry_count').eq('id', orderId).single();
                const currentRetries = order?.retry_count || 0;

                if (currentRetries < 3) {
                    console.log(`[Payout] Retrying Order ${orderId} (Attempt ${currentRetries + 1}/3)`);
                    const { error: retryError } = await supabase
                        .from('exchange_orders')
                        .update({ 
                            status: 'PENDING',
                            retry_count: currentRetries + 1,
                            updated_at: new Date()
                        })
                        .eq('id', orderId);

                    if (retryError) throw retryError;
                    return; // Retry scheduled
                }
            } catch (retryErr) {
                console.warn('Retry Logic Failed (Column missing?):', retryErr.message);
                // Proceed to refund if retry logic fails
            }

            const { error } = await supabase.rpc('refund_exchange_order', {
                p_order_id: orderId,
                p_reason: response.reason
            });
            if (error) console.error('Refund Error:', error);

        } else {
            // Still Processing / Stuck
            // We leave it as 'PROCESSING' in DB.
            // A separate "Stuck Order" monitor would handle timeouts > 5 mins.
        }
    }

    async logPayout(orderId, provider, request, response, stage) {
        try {
            await supabase.from('payout_attempts').insert({
                exchange_order_id: orderId,
                provider: provider,
                request_payload: request,
                response_payload: response,
                status: stage
            });
        } catch (error) {
            console.warn('Logging Payout Failed (Table missing?):', error.message);
        }
    }
}

module.exports = new PayoutService();
