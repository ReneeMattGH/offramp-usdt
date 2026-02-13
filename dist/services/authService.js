import supabase from '../utils/supabase.js';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import smsService from './smsService.js';
import { v4 as uuidv4 } from 'uuid';
export class AuthService {
    static instance;
    constructor() { }
    static getInstance() {
        if (!AuthService.instance) {
            AuthService.instance = new AuthService();
        }
        return AuthService.instance;
    }
    generateToken(userId) {
        return jwt.sign({ id: userId }, config.jwtSecret, { expiresIn: '7d' });
    }
    async sendOTP(accountNumber) {
        if (!accountNumber)
            throw new Error('Account number required');
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
        const { error } = await supabase
            .from('otp_store')
            .upsert({
            account_number: accountNumber,
            otp,
            expires_at: expiresAt,
            attempts: 0
        }, { onConflict: 'account_number' });
        if (error) {
            console.error('[AUTH_SERVICE] OTP Store Error:', error);
            throw new Error('Failed to generate OTP');
        }
        // In a production environment, this would use a real SMS gateway
        // The accountNumber is used as the phone number in this context
        return await smsService.sendOTP(accountNumber, otp);
    }
    async verifyOTP(accountNumber, otp) {
        const { data, error } = await supabase
            .from('otp_store')
            .select('*')
            .eq('account_number', accountNumber)
            .single();
        if (error || !data) {
            throw new Error('OTP not found or expired');
        }
        if (new Date(data.expires_at) < new Date()) {
            await this.deleteOTP(accountNumber);
            throw new Error('OTP expired');
        }
        if (data.attempts >= 5) {
            await this.deleteOTP(accountNumber);
            throw new Error('Too many failed attempts');
        }
        if (data.otp !== otp) {
            await supabase
                .from('otp_store')
                .update({ attempts: data.attempts + 1 })
                .eq('account_number', accountNumber);
            throw new Error('Invalid OTP');
        }
        await this.deleteOTP(accountNumber);
        return true;
    }
    async deleteOTP(accountNumber) {
        await supabase
            .from('otp_store')
            .delete()
            .eq('account_number', accountNumber);
    }
    async login(accountNumber, otp) {
        await this.verifyOTP(accountNumber, otp);
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('account_number', accountNumber)
            .maybeSingle();
        if (!user) {
            throw new Error('User not found. Please sign up.');
        }
        const token = this.generateToken(user.id);
        return { user, token };
    }
    async signup(data) {
        await this.verifyOTP(data.accountNumber, data.otp);
        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('account_number', data.accountNumber)
            .maybeSingle();
        if (existing) {
            throw new Error('User already exists');
        }
        const userId = uuidv4();
        // Referral code generation would happen here (omitted for brevity, assume a helper exists)
        const myReferralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const { data: newUser, error: createError } = await supabase
            .from('users')
            .insert({
            id: userId,
            account_holder_name: data.accountHolderName,
            account_number: data.accountNumber,
            ifsc_code: data.ifscCode,
            referral_code: myReferralCode,
            kyc_status: 'not_submitted',
            email: `${data.accountNumber}@internal.local`
        })
            .select()
            .single();
        if (createError)
            throw createError;
        // Create ledger account automatically
        await supabase
            .from('ledger_accounts')
            .insert({ user_id: userId, available_balance: 0, locked_balance: 0 });
        const token = this.generateToken(newUser.id);
        return { user: newUser, token };
    }
}
export default AuthService.getInstance();
//# sourceMappingURL=authService.js.map