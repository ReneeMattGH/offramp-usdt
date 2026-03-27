import { Request, Response } from 'express';
import { BaseController } from './baseController.js';
import authService from '../services/authService.js';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import supabase from '../utils/supabase.js';
import crypto from 'crypto';
import referralService from '../services/referralService.js';

const signupSchema = z.object({
  accountHolderName: z.string().min(2),
  phoneNumber: z.string().min(10),
  accountNumber: z.string().min(8),
  ifscCode: z.string().length(11),
  otp: z.string().length(6),
  referralCode: z.string().optional(),
});

const loginSchema = z.object({
  phoneNumber: z.string().min(10),
  otp: z.string().length(6),
});

const sendOtpSchema = z.object({
  phoneNumber: z.string().min(10),
});

export class AuthController extends BaseController {
  async sendOTP(req: Request, res: Response) {
    try {
      const parsed = sendOtpSchema.safeParse(req.body);
      if (!parsed.success) {
        return this.clientError(res, 'Invalid phone number format');
      }

      const sent = await authService.sendOTP(parsed.data.phoneNumber);
      if (!sent) {
        return this.fail(res, 'Failed to send OTP');
      }
      return this.ok(res, { success: true, message: 'OTP sent successfully' });
    } catch (error: any) {
      if (error?.message === 'RESEND_COOLDOWN') {
        return this.clientError(res, 'Please wait 30 seconds before resending OTP');
      }
      console.error('[AUTH_CONTROLLER] Send OTP Error:', error?.message || String(error));
      return this.fail(res, error?.message || 'Failed to send OTP');
    }
  }

  async verifyOTPOnly(req: Request, res: Response) {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return this.clientError(res, 'Invalid verification data');
      }

      const isValid = await authService.verifyOTP(parsed.data.phoneNumber, parsed.data.otp);
      return this.ok(res, { 
        success: isValid,
        message: 'OTP verified successfully' 
      });
    } catch (error: any) {
      return this.clientError(res, error.message);
    }
  }

  async login(req: Request, res: Response) {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return this.clientError(res, 'Invalid login data');
      }

      const result = await authService.login(parsed.data.phoneNumber, parsed.data.otp);
      return this.ok(res, result);
    } catch (error: any) {
      if (error.message === 'Invalid OTP' || error.message === 'User not found. Please sign up.') {
        return this.clientError(res, error.message);
      }
      return this.fail(res, error);
    }
  }

  async signup(req: Request, res: Response) {
    try {
      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) {
        return this.clientError(res, 'Invalid signup data');
      }

      const result = await authService.signup(parsed.data);
      return this.created(res, result);
    } catch (error: any) {
      if (error.message === 'Invalid OTP' || error.message === 'User already exists') {
        return this.clientError(res, error.message);
      }
      return this.fail(res, error);
    }
  }

  async me(req: Request, res: Response) {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];
      if (!token) return this.unauthorized(res, 'No token');

      const decoded = jwt.verify(token, config.jwtSecret) as { id: string };
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', decoded.id)
        .single();

      if (error || !user) return this.unauthorized(res, 'Invalid token');
      return this.ok(res, user);
    } catch (error: any) {
      return this.fail(res, error);
    }
  }

  async guestLogin(req: Request, res: Response) {
    try {
      if (config.nodeEnv !== 'development') {
        return this.forbidden(res, 'Guest login only allowed in development');
      }

      const { referralCode } = req.body as { referralCode?: string };
      const randomAcct = `GUEST${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const randomPhone = `+91${Math.floor(6000000000 + Math.random() * 4000000000)}`;
      const userId = crypto.randomUUID();
      const myReferralCode = referralService.generateCode();

      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          id: userId,
          account_holder_name: 'Guest User',
          phone_number: randomPhone,
          account_number: randomAcct,
          ifsc_code: 'SBIN0000000',
          referral_code: myReferralCode,
          kyc_status: 'not_submitted',
          email: `${randomAcct}@guest.local`
        })
        .select()
        .single();

      if (createError) throw createError;

      // Process referral if exists
      if (referralCode) {
        await referralService.processSignupReferral(userId, referralCode);
      }

      await supabase
        .from('ledger_accounts')
        .insert({ user_id: userId, available_balance: 0, locked_balance: 0 });

      const token = jwt.sign({ id: userId }, config.jwtSecret, { expiresIn: '7d' });
      return this.ok(res, { user: newUser, token });
    } catch (error: any) {
      return this.fail(res, error);
    }
  }
}

export default new AuthController();
