const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const ledgerService = require('./ledgerService');
const configService = require('./configService');

// Cache for rate
let cachedRate = {
    rate: 92.00, // Safe default fallback
    lastUpdated: 0
};

class ExchangeService {

    async getLiveRate() {
        const now = Date.now();
        const CACHE_DURATION = 10000; // 10 seconds
        const config = configService.getAll();
        const spreadPercent = config.exchange_spread_percent || 0;

        let marketRate = cachedRate.rate;

        if (now - cachedRate.lastUpdated >= CACHE_DURATION) {
            try {
                console.log('Fetching live USDT/INR rate...');
                const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=inr');
                
                if (!response.ok) {
                    throw new Error(`Rate fetch failed: ${response.statusText}`);
                }

                const data = await response.json();
                if (data.tether && data.tether.inr) {
                    const newRate = data.tether.inr;
                    console.log(`Live Rate Updated: ${newRate} INR/USDT`);
                    
                    cachedRate = {
                        rate: newRate,
                        lastUpdated: now
                    };
                    marketRate = newRate;
                } else {
                    throw new Error('Invalid rate data format');
                }
            } catch (error) {
                console.error('Rate Fetch Error:', error.message);
                // Continue with cached rate
            }
        }

        // Apply Spread (We pay less than market)
        // User gets: Market Rate * (1 - spread/100)
        const userRate = marketRate * (1 - (spreadPercent / 100));
        return Number(userRate.toFixed(2));
    }

    async createExchangeOrder(userId, usdtAmount, bankAccountId) {
        try {
            const config = configService.getAll();
            if (!config.exchanges_enabled) {
                throw new Error('Exchanges are currently paused by admin');
            }

            // 1. Get Locked Rate
            const rate = await this.getLiveRate();
            const inrAmount = Number((usdtAmount * rate).toFixed(2));
            const idempotencyKey = uuidv4(); 

            // 2. Call Atomic RPC
            const { data: orderId, error } = await supabase.rpc('create_exchange_order', {
                p_user_id: userId,
                p_usdt_amount: usdtAmount,
                p_inr_amount: inrAmount,
                p_rate: rate,
                p_bank_account_id: bankAccountId,
                p_idempotency_key: idempotencyKey
            });

            if (error) {
                console.error('RPC create_exchange_order failed:', error);
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
            console.error('Exchange Order Failed:', error);
            throw error;
        }
    }
}

module.exports = new ExchangeService();
