import supabase from '../utils/supabase.js';
import crypto from 'crypto';
export class ReferralService {
    static instance;
    constructor() { }
    static getInstance() {
        if (!ReferralService.instance) {
            ReferralService.instance = new ReferralService();
        }
        return ReferralService.instance;
    }
    generateCode() {
        return crypto.randomBytes(4).toString('hex').toUpperCase();
    }
    async ensureReferralCode(userId) {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('referral_code')
                .eq('id', userId)
                .single();
            if (data?.referral_code)
                return data.referral_code;
            let code = this.generateCode();
            let isUnique = false;
            let retries = 0;
            while (!isUnique && retries < 5) {
                const { data: existing } = await supabase
                    .from('users')
                    .select('id')
                    .eq('referral_code', code)
                    .maybeSingle();
                if (!existing) {
                    isUnique = true;
                }
                else {
                    code = this.generateCode();
                    retries++;
                }
            }
            if (!isUnique)
                throw new Error('Unique code generation failed');
            await supabase
                .from('users')
                .update({ referral_code: code })
                .eq('id', userId);
            return code;
        }
        catch (err) {
            console.error('[REFERRAL_SERVICE] Error:', err);
            return null;
        }
    }
    async processSignupReferral(newUserId, referralCode) {
        if (!referralCode)
            return;
        try {
            const { data: referrer } = await supabase
                .from('users')
                .select('id, referral_points')
                .eq('referral_code', referralCode)
                .single();
            if (!referrer || referrer.id === newUserId)
                return;
            await supabase
                .from('users')
                .update({ referred_by: referrer.id })
                .eq('id', newUserId);
            const BONUS = 10;
            await this.awardPoints(referrer.id, BONUS, 'signup_bonus', newUserId, 'Referral Signup Bonus');
        }
        catch (err) {
            console.error('[REFERRAL_SERVICE] Signup Referral Error:', err);
        }
    }
    async awardPoints(userId, amount, type, relatedUserId = null, description = '') {
        try {
            await supabase
                .from('referral_history')
                .insert({
                referrer_id: userId,
                referred_user_id: relatedUserId,
                points_amount: amount,
                type,
                description
            });
            const { data: user } = await supabase
                .from('users')
                .select('referral_points')
                .eq('id', userId)
                .single();
            const points = (user?.referral_points || 0) + amount;
            await supabase
                .from('users')
                .update({ referral_points: points })
                .eq('id', userId);
        }
        catch (err) {
            console.error('[REFERRAL_SERVICE] Award Points Error:', err);
        }
    }
    async getReferralStats(userId) {
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('referral_code, referral_points')
            .eq('id', userId)
            .single();
        if (userError)
            throw userError;
        const { count, error: historyError } = await supabase
            .from('referral_history')
            .select('*', { count: 'exact', head: true })
            .eq('referrer_id', userId)
            .eq('type', 'signup_bonus');
        if (historyError)
            throw historyError;
        return {
            code: user.referral_code,
            points: user.referral_points || 0,
            totalReferrals: count || 0
        };
    }
}
export default ReferralService.getInstance();
//# sourceMappingURL=referralService.js.map