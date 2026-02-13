const supabase = require('../utils/supabase');
const { v4: uuidv4 } = require('uuid');
const ledgerService = require('./ledgerService');
const RazorpayProvider = require('./payoutProvider');
const configService = require('./configService');

class PayoutService {
    constructor() {
        this.isProcessing = false;
        this.isPaused = false;
        this.provider = new RazorpayProvider();
    }

    setPaused(paused) {
        this.isPaused = paused;
        console.log(`System ${paused ? 'paused' : 'resumed'}`);
    }

    startWorker() {
        setInterval(() => this.processQueue(), 5000);
        setInterval(() => this.checkStuckOrders(), 60000);
    }

    async processQueue() {
        if (this.isProcessing || this.isPaused) return;
        this.isProcessing = true;

        try {
            const { data: order, error } = await supabase
                .from('payout_orders')
                .select('*, users(*), bank_accounts(*)')
                .eq('status', 'APPROVED')
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle();

            if (error) throw error;
            if (!order) {
                this.isProcessing = false;
                return;
            }

            if (!order.bank_accounts) {
                 await supabase
                    .from('payout_orders')
                    .update({ status: 'FAILED', failure_reason: 'Missing bank details' })
                    .eq('id', order.id);
                 await ledgerService.failPayout(order.user_id, order.usdt_amount, order.id);
                 return;
            }

            await supabase
                .from('payout_orders')
                .update({ status: 'PROCESSING', updated_at: new Date() })
                .eq('id', order.id);

            const result = await this.provider.initiatePayout(order, order.users, order.bank_accounts);
            await this.handleGatewayResponse(order, result);

        } catch (error) {
            console.error('Payout worker error:', error.message);
        } finally {
            this.isProcessing = false;
        }
    }

    async handleGatewayResponse(order, result) {
        if (result.status === 'SUCCESS') {
            const ledgerResult = await ledgerService.finalizePayout(order.user_id, order.usdt_amount, order.id);
            if (ledgerResult.success) {
                await supabase
                    .from('payout_orders')
                    .update({ 
                        status: 'COMPLETED', 
                        gateway_ref_id: result.utr || result.payout_id,
                        updated_at: new Date() 
                    })
                    .eq('id', order.id);
            } else {
                await supabase.from('payout_orders').update({ status: 'UNDER_REVIEW', failure_reason: 'Ledger failed' }).eq('id', order.id);
            }
        } else if (result.status === 'FAILED') {
            await ledgerService.failPayout(order.user_id, order.usdt_amount, order.id);
            await supabase
                .from('payout_orders')
                .update({ 
                    status: 'FAILED', 
                    failure_reason: result.reason,
                    updated_at: new Date() 
                })
                .eq('id', order.id);
        }
    }

    async checkStuckOrders() {
        if (this.isPaused) return;
        try {
            const timeout = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            const { data: stuck, error } = await supabase
                .from('payout_orders')
                .select('*')
                .eq('status', 'PROCESSING')
                .lt('updated_at', timeout);

            if (error) throw error;

            if (stuck?.length > 0) {
                for (const order of stuck) {
                    await supabase
                        .from('payout_orders')
                        .update({ status: 'UNDER_REVIEW', failure_reason: 'Processing timeout', updated_at: new Date() })
                        .eq('id', order.id);
                }
            }
        } catch (error) {
            console.error('Check stuck error:', error.message);
        }
    }

    async adminAction(orderId, action) {
        const { data: order } = await supabase.from('payout_orders').select('*').eq('id', orderId).single();
        if (!order) throw new Error('Order not found');

        if (action === 'approve_success') {
            const res = await ledgerService.finalizePayout(order.user_id, order.usdt_amount, order.id);
            if (res.success) {
                await supabase.from('payout_orders').update({ status: 'COMPLETED' }).eq('id', orderId);
            }
        } else if (action === 'reject_refund') {
            const res = await ledgerService.failPayout(order.user_id, order.usdt_amount, order.id);
            if (res.success) {
                await supabase.from('payout_orders').update({ status: 'FAILED', failure_reason: 'Admin rejected' }).eq('id', orderId);
            }
        }
        return { success: true };
    }

    async handleWebhook(payload) {
        const { event, payload: eventData } = payload;
        const payout = eventData?.payout?.entity;
        
        if (!payout || !payout.reference_id) return;

        const orderId = payout.reference_id;
        const { data: order } = await supabase.from('payout_orders').select('*').eq('id', orderId).maybeSingle();
        
        if (!order || order.status === 'COMPLETED' || order.status === 'FAILED') return;

        if (event === 'payout.processed') {
            const res = await ledgerService.finalizePayout(order.user_id, order.usdt_amount, order.id);
            if (res.success) {
                await supabase.from('payout_orders').update({ 
                    status: 'COMPLETED', 
                    gateway_ref_id: payout.utr || payout.id,
                    updated_at: new Date() 
                }).eq('id', orderId);
            }
        } else if (['payout.reversed', 'payout.rejected', 'payout.failed'].includes(event)) {
            await ledgerService.failPayout(order.user_id, order.usdt_amount, order.id);
            await supabase.from('payout_orders').update({ 
                status: 'FAILED', 
                failure_reason: payout.failure_reason || event,
                updated_at: new Date() 
            }).eq('id', orderId);
        }
    }
}

module.exports = new PayoutService();
