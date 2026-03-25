import supabase from '../utils/supabase.js';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import smsService from './smsService.js';
import { v4 as uuidv4 } from 'uuid';
import referralService from './referralService.js';

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

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    const { error } = await supabase
      .from('otp_store')
      .upsert({
        phone_number: normalizedPhone,
        otp,
        expires_at: expiresAt,
        attempts: 0
      }, { onConflict: 'phone_number' });

    if (error) {
      console.error('[AUTH_SERVICE] OTP Store Error:', error);
      throw new Error('Failed to generate OTP');
    }

    // In a production environment, this would use a real SMS gateway
    return await smsService.sendOTP(normalizedPhone, otp);
  }

  async verifyOTP(phoneNumber: string, otp: string): Promise<boolean> {
    const normalizedPhone = this.normalizeIndianPhone(phoneNumber);

    const { data, error } = await supabase
      .from('otp_store')
      .select('*')
      .eq('phone_number', normalizedPhone)
      .single();

    if (error || !data) {
      throw new Error('OTP not found or expired');
    }

    if (new Date(data.expires_at) < new Date()) {
      await this.deleteOTP(normalizedPhone);
      throw new Error('OTP expired');
    }

    if (data.attempts >= 5) {
      await this.deleteOTP(normalizedPhone);
      throw new Error('Too many failed attempts');
    }

    if (data.otp !== otp) {
      await supabase
        .from('otp_store')
        .update({ attempts: data.attempts + 1 })
        .eq('phone_number', normalizedPhone);
      throw new Error('Invalid OTP');
    }

    await this.deleteOTP(normalizedPhone);
    return true;
  }

  private async deleteOTP(phoneNumber: string): Promise<void> {
    await supabase
      .from('otp_store')
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
    accountHolderName: string;
    phoneNumber: string;
    accountNumber: string;
    ifscCode: string;
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
        account_holder_name: data.accountHolderName,
        phone_number: normalizedPhone,
        account_number: data.accountNumber,
        ifsc_code: data.ifscCode,
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
