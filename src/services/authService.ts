import supabase from '../utils/supabase.js';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import smsService from './smsService.js';
import { v4 as uuidv4 } from 'uuid';
import referralService from './referralService.js';
import crypto from 'crypto';

export class AuthService {
  private static instance: AuthService;

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private generateToken(userId: string): string {
    return jwt.sign({ id: userId }, config.jwtSecret, { expiresIn: '7d' });
  }

  private normalizeIndianPhone(phone: string): string {
    if (!phone) throw new Error('Phone number is required');
    
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');
    
    // If it's a 10 digit number starting with 6, 7, 8, or 9, it's a standard Indian mobile number
    if (cleaned.length === 10 && /^[6789]/.test(cleaned)) {
      return `+91${cleaned}`;
    }
    
    // If it starts with 91 and has 12 digits (91XXXXXXXXXX)
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
      return `+${cleaned}`;
    }
    
    // If it starts with +91 and has the right length
    if (phone.startsWith('+91') && cleaned.length === 12) {
      return `+${cleaned}`;
    }

    // Default: try to prepend + if not there
    return phone.startsWith('+') ? phone : `+${cleaned}`;
  }

  async sendOTP(phoneNumber: string): Promise<boolean> {
    const normalizedPhone = this.normalizeIndianPhone(phoneNumber);
    // Basic validation: Indian mobile starts with 6/7/8/9 and 10 digits after +91
    if (!/^\+91[6-9]\d{9}$/.test(normalizedPhone)) {
      throw new Error('Invalid Indian phone number');
    }

    // Resend cooldown: 30 seconds since last send
    const { data: recentList, error: recentErr } = await supabase
      .from('otp_verifications')
      .select('*')
      .eq('phone_number', normalizedPhone)
      .order('created_at', { ascending: false })
      .limit(1);
    if (recentErr) {
      console.error('[AUTH_SERVICE] Recent OTP lookup error:', recentErr);
    }
    const recent = Array.isArray(recentList) && recentList.length ? recentList[0] : null;
    if (recent && !recent.is_verified) {
      const secondsSince = (Date.now() - new Date(recent.created_at).getTime()) / 1000;
      if (secondsSince < 30) {
        throw new Error('RESEND_COOLDOWN');
      }
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    const { error } = await supabase
      .from('otp_verifications')
      .insert({
        phone_number: normalizedPhone,
        otp_code: otpHash,
        attempts: 0,
        is_verified: false,
        expires_at: expiresAt
      });

    if (error) {
      console.error('[AUTH_SERVICE] OTP insert error:', error);
      throw new Error('Failed to generate OTP');
    }

    // Real SMS via Twilio
    return await smsService.sendOTP(normalizedPhone, otp);
  }

  async verifyOTP(phoneNumber: string, otp: string): Promise<boolean> {
    const normalizedPhone = this.normalizeIndianPhone(phoneNumber);
    const { data: list, error } = await supabase
      .from('otp_verifications')
      .select('*')
      .eq('phone_number', normalizedPhone)
      .order('created_at', { ascending: false })
      .limit(1);

    const record = Array.isArray(list) && list.length ? list[0] : null;

    if (error || !record) {
      throw new Error('OTP not found or expired');
    }

    if (record.is_verified) {
      return true;
    }

    if (new Date(record.expires_at) < new Date()) {
      throw new Error('OTP expired');
    }

    if (record.attempts >= 5) {
      throw new Error('Too many failed attempts');
    }

    const inputHash = crypto.createHash('sha256').update(otp).digest('hex');
    if (record.otp_code !== inputHash) {
      await supabase
        .from('otp_verifications')
        .update({ attempts: record.attempts + 1 })
        .eq('id', record.id);
      throw new Error('Invalid OTP');
    }

    await supabase
      .from('otp_verifications')
      .update({ is_verified: true })
      .eq('id', record.id);
    return true;
  }

  private async deleteOTP(phoneNumber: string): Promise<void> {
    await supabase
      .from('otp_verifications')
      .delete()
      .eq('phone_number', phoneNumber);
  }

  async login(phoneNumber: string, otp: string) {
    const normalizedPhone = this.normalizeIndianPhone(phoneNumber);

    await this.verifyOTP(normalizedPhone, otp);

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('phone_number', normalizedPhone)
      .maybeSingle();

    if (!user) {
      throw new Error('User not found. Please sign up.');
    }

    const token = this.generateToken(user.id);
    return { user, token };
  }

  async signup(data: {
    accountHolderName?: string;
    phoneNumber: string;
    accountNumber?: string;
    ifscCode?: string;
    otp: string;
    referralCode?: string;
  }) {
    const normalizedPhone = this.normalizeIndianPhone(data.phoneNumber);

    await this.verifyOTP(normalizedPhone, data.otp);

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('phone_number', normalizedPhone)
      .maybeSingle();

    if (existing) {
      throw new Error('User already exists');
    }

    const userId = uuidv4();
    const myReferralCode = referralService.generateCode();

    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        id: userId,
        account_holder_name: data.accountHolderName || 'User',
        phone_number: normalizedPhone,
        account_number: data.accountNumber || '',
        ifsc_code: data.ifscCode || '',
        referral_code: myReferralCode,
        kyc_status: 'not_submitted',
        email: `${normalizedPhone}@internal.local`
      })
      .select()
      .single();

    if (createError) throw createError;

    // Process referral if exists
    if (data.referralCode) {
      await referralService.processSignupReferral(userId, data.referralCode);
    }

    // Create ledger account automatically
    await supabase
      .from('ledger_accounts')
      .insert({ user_id: userId, available_balance: 0, locked_balance: 0 });

    const token = this.generateToken(newUser.id);
    return { user: newUser, token };
  }
}

export default AuthService.getInstance();
