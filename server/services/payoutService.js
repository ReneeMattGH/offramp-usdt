const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const ledgerService = require('./ledgerService');
const RazorpayProvider = require('./payoutProvider'); // Import Provider

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Safe Supabase Initialization
let supabase;
if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
} else {
    console.warn('PayoutService: Supabase credentials missing. Using mock fallback.');
    supabase = {
        from: () => ({
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
            insert: async () => ({ error: null }),
            update: () => ({ eq: async () => ({ error: null }) })
        })
    };
}

const configService = require('./configService');

class PayoutService {
    constructor() {
        this.isProcessing = false;
        this.isPaused = false;
        this.provider = new RazorpayProvider(); // Initialize Provider
        
        // Mock Gateway Settings (Fallback)
        this.mockGateway = {
            successRate: 0.9, // 90% success
            latency: 2000     // 2 seconds
        };
    }

    setPaused(paused) {
        this.isPaused = paused;
        console.log(`[Payout] System ${paused ? 'PAUSED' : 'RESUMED'}`);
    }

    // Deprecated: Use ExchangeService for full flow
    async requestPayout(userId, usdtAmount, bankAccountId) {
        throw new Error('Please use ExchangeService to create exchange orders.');
    }

    // Worker Loop
    startWorker() {
        console.log('Starting Payout Worker...');
        setInterval(() => this.processQueue(), 5000); // Process PENDING orders
        setInterval(() => this.checkStuckOrders(), 60000); // Check for timeouts
    }

    async processQueue() {
        if (this.isProcessing || this.isPaused) return;

        // Check config if payouts are globally enabled (optional)
        // const config = configService.getAll();
        // if (!config.payouts_enabled) return; 

        this.isProcessing = true;

        try {
            // Fetch APPROVED orders (Waiting for payout)
            // Note: Orders start as PENDING (Waiting for Admin Approval) -> APPROVED (Waiting for Payout)
            const { data: order, error } = await supabase
                .from('payout_orders')
                .select('*, users(*), bank_accounts(*)') // Fetch user and bank details
                .eq('status', 'APPROVED')
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle();

            if (error) throw error;
            if (!order) {
                this.isProcessing = false;
                return;
            }

            console.log(`Processing Payout ${order.id} for User ${order.user_id}...`);

            // Check if bank account exists
            if (!order.bank_accounts) {
                 console.error(`Payout ${order.id} Missing Bank Account Details. Failing.`);
                 await supabase
                    .from('payout_orders')
                    .update({ status: 'FAILED', failure_reason: 'Missing Bank Account Details' })
                    .eq('id', order.id);
                 
                 // Refund
                 await ledgerService.failPayout(order.user_id, order.usdt_amount, order.id);
                 return;
            }

            // Mark as PROCESSING
            await supabase
                .from('payout_orders')
                .update({ status: 'PROCESSING', updated_at: new Date() })
                .eq('id', order.id);

            // Execute Payout (Provider or Mock)
            let result;
            if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
                // Pass bank details to provider
                const bankDetails = order.bank_accounts;
                result = await this.provider.initiatePayout(order, order.users, bankDetails);
            } else {
                console.warn('Razorpay Keys Missing - Using Mock Gateway');
                result = await this.simulateGateway(order);
            }

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
        console.log(`Payout ${order.id} Timed Out (Real). Leaving in PROCESSING for safety.`);
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
