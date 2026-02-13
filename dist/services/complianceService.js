import supabase from '../utils/supabase.js';
import configService from './configService.js';
export class ComplianceService {
    static instance;
    fallbackLimits = {
        daily_exchange_usdt: 10000,
        daily_withdrawal_inr: 500000,
        daily_withdrawal_usdt: 50000
    };
    constructor() { }
    static getInstance() {
        if (!ComplianceService.instance) {
            ComplianceService.instance = new ComplianceService();
        }
        return ComplianceService.instance;
    }
    getLimit(key) {
        return configService.get(key) || this.fallbackLimits[key];
    }
    isPaused(type) {
        const map = {
            deposits: 'deposits_enabled',
            exchanges: 'exchanges_enabled',
            withdrawals: 'withdrawals_enabled',
            usdt_withdrawals: 'withdrawals_enabled'
        };
        const key = map[type];
        if (!key)
            return false;
        return !configService.get(key);
    }
    async checkUSDTWithdrawalLimit(userId, amount) {
        if (this.isPaused('usdt_withdrawals')) {
            throw new Error('USDT withdrawals are currently paused');
        }
        const limit = this.getLimit('daily_withdrawal_usdt');
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const { data, error } = await supabase
            .from('usdt_withdrawals')
            .select('usdt_amount')
            .eq('user_id', userId)
            .gte('created_at', startOfDay.toISOString());
        if (error)
            throw error;
        const total = data.reduce((sum, w) => sum + (Number(w.usdt_amount) || 0), 0);
        if (total + amount > limit) {
            throw new Error(`Daily USDT withdrawal limit exceeded (${limit} USDT)`);
        }
        return true;
    }
    async checkExchangeLimit(userId, amount) {
        if (this.isPaused('exchanges')) {
            throw new Error('Exchanges are currently paused');
        }
        const limit = this.getLimit('daily_exchange_usdt');
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const { data, error } = await supabase
            .from('exchange_orders')
            .select('usdt_amount')
            .eq('user_id', userId)
            .gte('created_at', startOfDay.toISOString());
        if (error)
            throw error;
        const total = data.reduce((sum, order) => sum + (Number(order.usdt_amount) || 0), 0);
        if (total + amount > limit) {
            throw new Error(`Daily exchange limit exceeded (${limit} USDT)`);
        }
        return true;
    }
    async checkWithdrawalLimit(userId, amount) {
        if (this.isPaused('withdrawals')) {
            throw new Error('INR withdrawals are currently paused');
        }
        const limit = this.getLimit('daily_withdrawal_inr');
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const { data, error } = await supabase
            .from('payout_orders')
            .select('inr_amount')
            .eq('user_id', userId)
            .gte('created_at', startOfDay.toISOString());
        if (error)
            throw error;
        const total = data.reduce((sum, w) => sum + (Number(w.inr_amount) || 0), 0);
        if (total + amount > limit) {
            throw new Error(`Daily INR withdrawal limit exceeded (${limit} INR)`);
        }
        return true;
    }
}
export default ComplianceService.getInstance();
//# sourceMappingURL=complianceService.js.map