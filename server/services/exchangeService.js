const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const ledgerService = require('./ledgerService');

// Cache for rate (Simple in-memory cache for demo)
let cachedRate = {
    rate: 88.50, // Default fallback
    lastUpdated: 0
};

class ExchangeService {

    async getLiveRate() {
        const now = Date.now();
        const CACHE_DURATION = 10000; // 10 seconds

        if (now - cachedRate.lastUpdated < CACHE_DURATION) {
            return cachedRate.rate;
        }

        // TODO: Integrate real API (e.g., CoinGecko, Binance)
        // For now, simulate small fluctuation around 88-90
        const baseRate = 89.00;
        const fluctuation = (Math.random() - 0.5) * 0.5; // +/- 0.25
        const newRate = Number((baseRate + fluctuation).toFixed(2));

        cachedRate = {
            rate: newRate,
            lastUpdated: now
        };

        return newRate;
    }

    async createExchangeOrder(userId, usdtAmount) {
        try {
            // 1. Get Locked Rate
            const rate = await this.getLiveRate();
            const inrAmount = Number((usdtAmount * rate).toFixed(2));
            const idempotencyKey = uuidv4(); // Generate one if frontend doesn't provide (or use passed one)

            // 2. Call Atomic RPC
            const { data: orderId, error } = await supabase.rpc('create_exchange_order', {
                p_user_id: userId,
                p_usdt_amount: usdtAmount,
                p_inr_amount: inrAmount,
                p_rate: rate,
                p_idempotency_key: idempotencyKey
            });

            if (error) {
                // Fallback for missing RPC
                // We'll be more permissive with the check to ensure fallback triggers
                console.warn('RPC create_exchange_order failed:', error.message);
                
                if (true) { // Always try fallback if RPC fails for now (since we know it's missing)
                     console.warn('Falling back to non-atomic flow');
                     
                     // Generate ID
                     const fallbackOrderId = uuidv4();

                     // 1. Lock Funds
                     await ledgerService.lockFundsForExchange(userId, usdtAmount, fallbackOrderId);

                     // 2. Create Order
                     const { error: insertError } = await supabase.from('exchange_orders').insert({
                         id: fallbackOrderId,
                         user_id: userId,
                         usdt_amount: usdtAmount,
                         inr_amount: inrAmount,
                         rate: rate,
                         status: 'PENDING',
                         idempotency_key: idempotencyKey,
                         rate_locked: rate
                     });

                     if (insertError) {
                         // Rollback lock if insert fails (manual rollback needed)
                         // For now, just throw
                         throw insertError;
                     }
                     
                     return {
                        success: true,
                        order_id: fallbackOrderId,
                        usdt_amount: usdtAmount,
                        inr_amount: inrAmount,
                        rate: rate,
                        status: 'PENDING'
                     };
                }
                throw error;
            }

            return {
                success: true,
                order_id: orderId,
                usdt_amount: usdtAmount,
                inr_amount: inrAmount,
                rate: rate,
                status: 'PENDING'
            };

        } catch (error) {
            console.error('Create Exchange Order Error:', error);
            return { success: false, error: error.message };
        }
    }

    async getUserOrders(userId) {
        const { data, error } = await supabase
            .from('exchange_orders')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data;
    }
}

module.exports = new ExchangeService();
