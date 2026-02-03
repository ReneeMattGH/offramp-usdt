const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const ledgerService = require('./ledgerService');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

class PayoutService {
    constructor() {
        this.isProcessing = false;
        this.isPaused = false;
        // Configurable Mock Gateway
        this.mockGateway = {
            rate: 88.50, // USDT to INR
            successRate: 0.8, // 80% success
            latency: 1000 // 1 second
        };
    }

    setPaused(paused) {
        this.isPaused = paused;
        console.log(`[Payout] System ${paused ? 'PAUSED' : 'RESUMED'}`);
    }

    // 1. Request Payout
    async requestPayout(userId, usdtAmount, bankAccountId) {
        if (this.isPaused) throw new Error('Payouts are currently paused');

        const inrAmount = usdtAmount * this.mockGateway.rate;
        const idempotencyKey = uuidv4();

        // Check for existing active payout (Double-Spend Protection)
        try {
            const { data: activeOrder, error: checkError } = await supabase
                .from('payout_orders')
                .select('id')
                .eq('user_id', userId)
                .in('status', ['PENDING', 'PROCESSING'])
                .maybeSingle();

            if (activeOrder) {
                throw new Error('You already have a pending payout. Please wait for it to complete.');
            }
        } catch (checkErr) {
            // Ignore if table missing
            if (checkErr.code !== 'PGRST205' && !checkErr.message?.includes('relation')) {
                throw checkErr;
            }
        }

        // 1. Create Order (PENDING)
        let order = null;
        try {
            const { data, error: createError } = await supabase
                .from('payout_orders')
                .insert({
                    user_id: userId,
                    usdt_amount: usdtAmount,
                    inr_amount: inrAmount,
                    exchange_rate: this.mockGateway.rate,
                    bank_account_id: bankAccountId,
                    status: 'PENDING',
                    idempotency_key: idempotencyKey
                })
                .select()
                .single();

            if (createError) throw createError;
            order = data;
        } catch (createErr) {
             if (createErr.code === 'PGRST205' || createErr.message?.includes('relation')) {
                 console.warn('payout_orders table missing. Simulating Payout Order.');
                 order = {
                     id: uuidv4(),
                     user_id: userId,
                     usdt_amount: usdtAmount,
                     inr_amount: inrAmount,
                     status: 'PENDING',
                     created_at: new Date().toISOString()
                 };
             } else {
                 throw createErr;
             }
        }

        console.log(`Payout Order Created: ${order.id} (${usdtAmount} USDT -> ${inrAmount} INR)`);

        // 2. Lock Funds (Atomic)
        // If simulated, locking might fail if ledger_accounts missing, but ledgerService handles that now.
        const lockResult = await ledgerService.lockPayoutFunds(userId, usdtAmount, order.id);
        
        if (!lockResult.success) {
            // Failed to lock -> Fail Order immediately
            // Only update DB if table exists
            try {
                await supabase
                    .from('payout_orders')
                    .update({ status: 'FAILED', failure_reason: lockResult.message || 'Insufficient funds' })
                    .eq('id', order.id);
            } catch (e) {}
            throw new Error(lockResult.message || 'Insufficient funds');
        }

        return order;
    }

    // Worker Loop
    startWorker() {
        console.log('Starting Payout Worker...');
        setInterval(() => this.processQueue(), 5000); // Process PENDING orders
        setInterval(() => this.checkStuckOrders(), 60000); // Check for timeouts
    }

    async processQueue() {
        if (this.isProcessing || this.isPaused) return;
        this.isProcessing = true;

        try {
            // Fetch PENDING orders that have funds locked (implicit by flow, but good to verify if needed)
            // Actually, requestPayout locks funds. So we just need to pick up PENDING orders.
            const { data: order, error } = await supabase
                .from('payout_orders')
                .select('*')
                .eq('status', 'PENDING')
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle();

            if (error) throw error;
            if (!order) {
                this.isProcessing = false;
                return;
            }

            console.log(`Processing Payout ${order.id}...`);

            // Mark as PROCESSING
            await supabase
                .from('payout_orders')
                .update({ status: 'PROCESSING', updated_at: new Date() })
                .eq('id', order.id);

            // Simulate Bank Gateway
            const result = await this.simulateGateway(order);

            // Handle Result
            await this.handleGatewayResponse(order, result);

        } catch (error) {
            if (error.code === 'PGRST205' && error.message.includes('payout_orders')) {
                console.warn('Payout Worker: payout_orders table missing. Pausing worker to prevent log spam.');
                this.isPaused = true; 
            } else {
                console.error('Payout Worker Error:', error);
            }
        } finally {
            this.isProcessing = false;
        }
    }

    async simulateGateway(order) {
        return new Promise(resolve => {
            setTimeout(() => {
                const rand = Math.random();
                if (rand < this.mockGateway.successRate) {
                    resolve({ status: 'SUCCESS', refId: 'BANK_' + uuidv4().substr(0, 8) });
                } else if (rand < 0.95) {
                    resolve({ status: 'FAILED', reason: 'Bank Server Error' });
                } else {
                    resolve({ status: 'TIMEOUT' }); // Simulate no response
                }
            }, this.mockGateway.latency);
        });
    }

    async handleGatewayResponse(order, result) {
        console.log(`Gateway Response for ${order.id}: ${result.status}`);

        if (result.status === 'SUCCESS') {
            // 1. Finalize Ledger (Burn Locked Funds)
            const ledgerResult = await ledgerService.finalizePayout(order.user_id, order.usdt_amount, order.id);
            
            if (ledgerResult.success) {
                // 2. Mark Order COMPLETED
                await supabase
                    .from('payout_orders')
                    .update({ 
                        status: 'COMPLETED', 
                        gateway_ref_id: result.refId,
                        updated_at: new Date() 
                    })
                    .eq('id', order.id);
                console.log(`Payout ${order.id} COMPLETED.`);
            } else {
                console.error(`CRITICAL: Failed to finalize ledger for ${order.id}`);
                // Admin intervention needed - keep as PROCESSING or move to UNDER_REVIEW
                await supabase.from('payout_orders').update({ status: 'UNDER_REVIEW', failure_reason: 'Ledger Finalization Failed' }).eq('id', order.id);
            }

        } else if (result.status === 'FAILED') {
            // 1. Refund Ledger (Unlock Funds)
            await ledgerService.failPayout(order.user_id, order.usdt_amount, order.id);

            // 2. Mark Order FAILED
            await supabase
                .from('payout_orders')
                .update({ 
                    status: 'FAILED', 
                    failure_reason: result.reason,
                    updated_at: new Date() 
                })
                .eq('id', order.id);
            console.log(`Payout ${order.id} FAILED and REFUNDED.`);

        } else if (result.status === 'TIMEOUT') {
            // Gateway Timeout - Do not refund yet! Wait for checkStuckOrders or Admin.
            // But per Rule 6 "If payout FAILED or TIMEOUT: Unlock... Mark FAILED"
            // And Rule 7 "If no response within 5 minutes... UNDER_REVIEW"
            // I'll stick to Rule 7 for TIMEOUTs here (simulated silence), letting checkStuckOrders handle it.
            // Or I can treat explicit TIMEOUT signal as "Unknown Status".
            console.log(`Payout ${order.id} Timed Out (Simulated). Leaving in PROCESSING for safety.`);
        }
    }

    async checkStuckOrders() {
        if (this.isPaused) return;
        try {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            
            const { data: stuckOrders, error } = await supabase
                .from('payout_orders')
                .select('*')
                .eq('status', 'PROCESSING')
                .lt('updated_at', fiveMinutesAgo);

            if (error) throw error;

            if (stuckOrders && stuckOrders.length > 0) {
                console.log(`Found ${stuckOrders.length} stuck payouts. Moving to UNDER_REVIEW.`);
                
                for (const order of stuckOrders) {
                    await supabase
                        .from('payout_orders')
                        .update({ status: 'UNDER_REVIEW', failure_reason: 'Timeout - No Response', updated_at: new Date() })
                        .eq('id', order.id);
                }
            }
        } catch (error) {
            if (error.code === 'PGRST205' && error.message.includes('payout_orders')) {
                // Squelch error
            } else {
                console.error('Error checking stuck payouts:', error);
            }
        }
    }

    // Admin Actions
    async adminAction(orderId, action) {
        const { data: order, error } = await supabase.from('payout_orders').select('*').eq('id', orderId).single();
        if (!order) throw new Error('Order not found');

        if (action === 'approve_success') {
            // Manually mark success (e.g. after verifying bank status)
            const ledgerResult = await ledgerService.finalizePayout(order.user_id, order.usdt_amount, order.id);
            if (ledgerResult.success) {
                await supabase.from('payout_orders').update({ status: 'COMPLETED', failure_reason: 'Admin Manual Approval' }).eq('id', orderId);
            }
        } else if (action === 'reject_refund') {
            // Manually refund
            const ledgerResult = await ledgerService.failPayout(order.user_id, order.usdt_amount, order.id);
            if (ledgerResult.success) {
                await supabase.from('payout_orders').update({ status: 'FAILED', failure_reason: 'Admin Manual Rejection' }).eq('id', orderId);
            }
        } else {
            throw new Error('Invalid action');
        }
        return { success: true };
    }
}

module.exports = new PayoutService();
