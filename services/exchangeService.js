const supabase = require('../utils/supabase');
const { v4: uuidv4 } = require('uuid');
const ledgerService = require('./ledgerService');
const configService = require('./configService');
const complianceService = require('./complianceService');

let cachedRate = {
    rate: 92.00,
    lastUpdated: 0
};

class ExchangeService {
    async getLiveRate() {
        const now = Date.now();
        const CACHE_DURATION = 10000;
        const config = configService.getAll();
        const spreadPercent = config.exchange_spread_percent || 0;

        let marketRate = cachedRate.rate;

        if (now - cachedRate.lastUpdated >= CACHE_DURATION) {
            try {
                const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=inr');
                if (response.ok) {
                    const data = await response.json();
                    if (data.tether?.inr) {
                        marketRate = data.tether.inr;
                        cachedRate = { rate: marketRate, lastUpdated: now };
                    }
                }
            } catch (error) {
                console.error('Rate fetch error:', error.message);
            }
        }

        const userRate = marketRate * (1 - (spreadPercent / 100));
        return Number(userRate.toFixed(2));
    }

    async createExchangeOrder(userId, usdtAmount, bankAccountId, bankDetails = null) {
        try {
            const config = configService.getAll();
            if (!config.exchanges_enabled) {
                throw new Error('Exchanges are paused');
            }

            const rate = await this.getLiveRate();
            const inrAmount = Number((usdtAmount * rate).toFixed(2));
            
            // Check limits
            await complianceService.checkExchangeLimit(userId, usdtAmount);
            await complianceService.checkWithdrawalLimit(userId, inrAmount);

            const idempotencyKey = uuidv4(); 
            
            let finalBankAccountId = bankAccountId;
            
            if (!finalBankAccountId && bankDetails) {
                const { data: existingBank } = await supabase
                    .from('bank_accounts')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('account_number', bankDetails.account_number)
                    .eq('ifsc_code', bankDetails.ifsc)
                    .maybeSingle();
                    
                if (existingBank) {
                    finalBankAccountId = existingBank.id;
                } else {
                    const { data: newBank, error: createError } = await supabase
                        .from('bank_accounts')
                        .insert({
                            user_id: userId,
                            account_holder_name: bankDetails.account_holder_name,
                            account_number: bankDetails.account_number,
                            ifsc_code: bankDetails.ifsc,
                            bank_name: 'Bank',
                            is_verified: true
                        })
                        .select()
                        .single();
                        
                    if (createError) throw new Error('Failed to save bank');
                    finalBankAccountId = newBank.id;
                }
            }

            const { data: orderId, error } = await supabase.rpc('create_exchange_order', {
                p_user_id: userId,
                p_usdt_amount: usdtAmount,
                p_inr_amount: inrAmount,
                p_rate: rate,
                p_bank_account_id: finalBankAccountId,
                p_idempotency_key: idempotencyKey
            });

            if (error) throw error;

            return {
                success: true,
                order_id: orderId,
                usdt_amount: usdtAmount,
                inr_amount: inrAmount,
                rate: rate,
                status: 'PENDING'
            };
        } catch (error) {
            console.error('Exchange failed:', error.message);
            throw error;
        }
    }
}

module.exports = new ExchangeService();
