const supabase = require('../utils/supabase');
const jwt = require('jsonwebtoken');
const config = require('../config');
const referralService = require('./referralService');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = config.JWT_SECRET;

class AuthService {
    constructor() {
        // In-memory store for demo purposes, should be replaced with Redis for production
        this.otpStore = new Map();
    }

    generateToken(userId) {
        return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' });
    }

    async sendOTP(accountNumber) {
        if (!accountNumber) throw new Error('Account number required');

        // Generate a random 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        this.otpStore.set(accountNumber, otp);
        
        // In a real app, this would be sent via SMS/Email
        console.log(`[AUTH] OTP for ${accountNumber}: ${otp}`);
        
        return true;
    }

    async login(accountNumber, otp) {
        const storedOtp = this.otpStore.get(accountNumber);
        
        if (!storedOtp || otp !== storedOtp) {
            throw new Error('Invalid OTP');
        }

        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('account_number', accountNumber)
            .maybeSingle();

        if (!user) {
            throw new Error('User not found');
        }

        const token = this.generateToken(user.id);
        return { user, token };
    }

    async signup({ accountHolderName, accountNumber, ifscCode, otp, referralCode }) {
        const storedOtp = this.otpStore.get(accountNumber);
        if (!storedOtp || otp !== storedOtp) {
            throw new Error('Invalid OTP');
        }

        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('account_number', accountNumber)
            .maybeSingle();

        if (existing) {
            throw new Error('User already exists');
        }

        // Generate a new internal ID
        const userId = uuidv4();
        const myReferralCode = referralService.generateCode();

        const { data: newUser, error: createError } = await supabase
            .from('users')
            .insert({
                id: userId,
                account_holder_name: accountHolderName,
                account_number: accountNumber,
                ifsc_code: ifscCode,
                referral_code: myReferralCode,
                kyc_status: 'not_submitted',
                email: `${accountNumber}@internal.local`
            })
            .select()
            .single();

        if (createError) throw createError;

        if (referralCode) {
            try {
                await referralService.processSignupReferral(newUser.id, referralCode);
            } catch (err) {
                console.error('Referral processing failed:', err);
            }
        }

        const token = this.generateToken(newUser.id);
        return { user: newUser, token };
    }

    async guestLogin(referralCode) {
        const randomId = Math.floor(Math.random() * 1000000);
        const userId = uuidv4();
        
        const myReferralCode = referralService.generateCode();
        const { data: newUser, error: createError } = await supabase
            .from('users')
            .insert({
                id: userId,
                account_holder_name: `Guest ${randomId}`,
                account_number: `GUEST${randomId}`,
                ifsc_code: 'GUEST',
                referral_code: myReferralCode,
                kyc_status: 'not_submitted',
                email: `guest${randomId}@internal.local`
            })
            .select()
            .single();

        if (createError) throw createError;

        if (referralCode) {
            try {
                await referralService.processSignupReferral(newUser.id, referralCode);
            } catch (err) {
                console.error('Referral processing failed:', err);
            }
        }

        const token = this.generateToken(newUser.id);
        return { user: newUser, token };
    }
}

module.exports = new AuthService();
