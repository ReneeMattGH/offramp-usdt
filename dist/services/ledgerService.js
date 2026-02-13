import supabase from '../utils/supabase.js';
export class LedgerService {
    static instance;
    constructor() { }
    static getInstance() {
        if (!LedgerService.instance) {
            LedgerService.instance = new LedgerService();
        }
        return LedgerService.instance;
    }
    async ensureAccount(userId) {
        try {
            const { data, error } = await supabase
                .from('ledger_accounts')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();
            if (error)
                throw error;
            if (!data) {
                await supabase.from('ledger_accounts').insert({
                    user_id: userId,
                    available_balance: 0,
                    locked_balance: 0,
                    settled_balance: 0
                });
            }
        }
        catch (e) {
            console.error('Ledger account sync failed:', e.message);
        }
    }
    async getWalletBalance(userId) {
        try {
            const { data, error } = await supabase.rpc('get_calculated_balance', { p_user_id: userId });
            if (error)
                throw error;
            return {
                available: data.calculated_available,
                locked: data.calculated_locked,
                is_consistent: data.is_consistent
            };
        }
        catch (err) {
            console.error('Balance fetch failed:', err.message);
            return { available: 0, locked: 0, is_consistent: true };
        }
    }
    async getLedgerHistory(userId, limit = 50) {
        const { data, error } = await supabase
            .from('ledger_entries')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error)
            throw error;
        return data;
    }
    async creditDeposit(userId, amount, txHash, description = 'Deposit') {
        try {
            await this.ensureAccount(userId);
            const { data, error } = await supabase.rpc('credit_deposit', {
                p_user_id: userId,
                p_amount: amount,
                p_tx_hash: txHash,
                p_description: description
            });
            if (error)
                throw error;
            return data.success;
        }
        catch (error) {
            console.error('Deposit credit failed:', error);
            throw error;
        }
    }
    async lockPayoutFunds(userId, amount, orderId) {
        const { data, error } = await supabase.rpc('lock_payout_funds', {
            p_user_id: userId,
            p_amount: amount,
            p_order_id: orderId,
            p_description: `Payout Lock for Order ${orderId}`
        });
        if (error)
            throw error;
        return data;
    }
    async finalizePayout(userId, amount, orderId) {
        const { data, error } = await supabase.rpc('finalize_payout', {
            p_user_id: userId,
            p_amount: amount,
            p_order_id: orderId
        });
        if (error)
            throw error;
        return data;
    }
    async failPayout(userId, amount, orderId) {
        const { data, error } = await supabase.rpc('fail_payout', {
            p_user_id: userId,
            p_amount: amount,
            p_order_id: orderId
        });
        if (error)
            throw error;
        return data;
    }
    async lockFundsForExchange(userId, amount, exchangeId) {
        const { data, error } = await supabase.rpc('lock_funds', {
            p_user_id: userId,
            p_amount: amount,
            p_ref_id: exchangeId,
            p_description: 'Locked for Exchange'
        });
        if (error)
            throw error;
        if (!data.success)
            throw new Error(data.message || 'Lock failed');
        return true;
    }
    async lockFundsForWithdrawal(userId, amount, withdrawalId) {
        const { data, error } = await supabase.rpc('lock_funds', {
            p_user_id: userId,
            p_amount: amount,
            p_ref_id: withdrawalId,
            p_description: 'USDT Withdrawal Lock'
        });
        if (error)
            throw error;
        if (!data.success)
            throw new Error(data.message || 'Lock failed');
        return true;
    }
    async finalizeWithdrawal(userId, amount, withdrawalId) {
        const { data, error } = await supabase.rpc('finalize_withdrawal', {
            p_user_id: userId,
            p_amount: amount,
            p_withdrawal_id: withdrawalId
        });
        if (error)
            throw error;
        return data.success;
    }
    async failWithdrawal(userId, amount, withdrawalId) {
        const { data, error } = await supabase.rpc('fail_withdrawal', {
            p_user_id: userId,
            p_amount: amount,
            p_withdrawal_id: withdrawalId
        });
        if (error)
            throw error;
        return data.success;
    }
    async settleExchange(userId, amount, exchangeId) {
        const { data, error } = await supabase.rpc('settle_exchange', {
            p_user_id: userId,
            p_amount: amount,
            p_ref_id: exchangeId
        });
        if (error)
            throw error;
        return true;
    }
    async refundExchange(userId, amount, exchangeId) {
        const { data, error } = await supabase.rpc('refund_exchange', {
            p_user_id: userId,
            p_amount: amount,
            p_ref_id: exchangeId
        });
        if (error)
            throw error;
        return true;
    }
}
export default LedgerService.getInstance();
//# sourceMappingURL=ledgerService.js.map