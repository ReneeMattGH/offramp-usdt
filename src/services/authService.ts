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

  async sendOTP(phoneNumber: string): Promise<boolean> {
    if (!phoneNumber) throw new Error('Phone number required');

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    const { error } = await supabase
      .from('otp_store')
      .upsert({
        phone_number: phoneNumber,
        otp,
        expires_at: expiresAt,
        attempts: 0
      }, { onConflict: 'phone_number' });

    if (error) {
      console.error('[AUTH_SERVICE] OTP Store Error:', error);
      throw new Error('Failed to generate OTP');
    }

    // In a production environment, this would use a real SMS gateway
    return await smsService.sendOTP(phoneNumber, otp);
  }

  async verifyOTP(phoneNumber: string, otp: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('otp_store')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();

    if (error || !data) {
      throw new Error('OTP not found or expired');
    }

    if (new Date(data.expires_at) < new Date()) {
      await this.deleteOTP(phoneNumber);
      throw new Error('OTP expired');
    }

    if (data.attempts >= 5) {
      await this.deleteOTP(phoneNumber);
      throw new Error('Too many failed attempts');
    }

    if (data.otp !== otp) {
      await supabase
        .from('otp_store')
        .update({ attempts: data.attempts + 1 })
        .eq('phone_number', phoneNumber);
      throw new Error('Invalid OTP');
    }

    await this.deleteOTP(phoneNumber);
    return true;
  }

  private async deleteOTP(phoneNumber: string): Promise<void> {
    await supabase
      .from('otp_store')
      .delete()
      .eq('phone_number', phoneNumber);
  }

  async login(phoneNumber: string, otp: string) {
    await this.verifyOTP(phoneNumber, otp);

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('phone_number', phoneNumber)
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
    await this.verifyOTP(data.phoneNumber, data.otp);

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('phone_number', data.phoneNumber)
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
        phone_number: data.phoneNumber,
        account_number: data.accountNumber,
        ifsc_code: data.ifscCode,
        referral_code: myReferralCode,
        kyc_status: 'not_submitted',
        email: `${data.phoneNumber}@internal.local`
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
