import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { generateToken } from '../utils/jwt.js';
import supabase from '../utils/supabase.js';
import { sendOTPEmail } from '../utils/email.js';
import { auditService } from '../services/auditService.js';

export class AuthController {
  
  // Basic email pattern validation
  private static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // ==========================
  // GOOGLE AUTHENTICATION
  // ==========================
  static async googleAuth(req: Request, res: Response): Promise<any> {
    try {
      const { id_token } = req.body;
      if (!id_token) return res.status(400).json({ error: 'id_token is required' });

      const payload = await AuthService.verifyGoogleToken(id_token);
      if (!payload || !payload.email) return res.status(400).json({ error: 'Invalid Google token or missing email payload.' });

      const email = payload.email.toLowerCase();
      const google_id = payload.sub;
      const name = payload.name || '';

      let user = await AuthService.findUserByEmail(email);

      if (!user) {
        const { data: newUser, error } = await supabase
          .from('users')
          .insert([{ 
            email,
            google_id,
            account_holder_name: name,
            auth_provider: 'google',
            email_verified: true,
            kyc_status: 'not_submitted'
          }])
          .select()
          .single();

        if (error) {
          console.error("Supabase Insertion Error (Google):", error);
          return res.status(500).json({ error: 'Database conflict while creating Google User.' });
        }
        
        user = newUser;
        await auditService.log('user', user.id, 'SIGNUP_GOOGLE', user.id, {}, req.ip);
      } else {
        const updates: any = {};
        if (!user.google_id) updates.google_id = google_id;
        if (!user.auth_provider) updates.auth_provider = 'google';
        if (!user.email_verified) updates.email_verified = true;
        if (!user.account_holder_name && name) updates.account_holder_name = name;

        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabase
            .from('users')
            .update(updates)
            .eq('id', user.id);

          if (updateError) throw updateError;
          Object.assign(user, updates);
        }
        await auditService.log('user', user.id, 'LOGIN_GOOGLE', user.id, {}, req.ip);
      }

      const token = generateToken({ id: user.id });
      return res.status(200).json({ access_token: token, user });

    } catch (error: any) {
      console.error('Google Auth Error:', error);
      return res.status(500).json({ error: 'Internal server error during Google Authentication.' });
    }
  }

  // ==========================
  // GET CURRENT SESSION / ME
  // ==========================
  static async me(req: Request, res: Response): Promise<any> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized.' });

      const user = await AuthService.findUserById(userId);
      if (!user) return res.status(404).json({ error: 'User not found.' });

      delete user.password_hash;
      delete user.email_verification_token;
      
      return res.status(200).json({ user });
    } catch (error: any) {
      console.error('Fetch Me Error:', error);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  }

  // ==========================
  // EMAIL OTP FLOW (UNIFIED SIGNUP/LOGIN)
  // ==========================
  static async sendEmailOTP(req: Request, res: Response): Promise<any> {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required.' });
      
      const normalizedEmail = email.toLowerCase().trim();
      if (!AuthController.validateEmail(normalizedEmail)) {
        return res.status(400).json({ error: 'Invalid email format.' });
      }

      const otp = AuthService.generateOTP();
      const otpExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 mins

      const user = await AuthService.findUserByEmail(normalizedEmail);

      if (user) {
        // User exists, update OTP for login
        const { error } = await supabase
          .from('users')
          .update({ email_otp: otp, email_otp_expires: otpExpires })
          .eq('id', user.id);
        if (error) throw error;
        await auditService.log('user', user.id, 'OTP_REQUESTED_LOGIN', user.id, {}, req.ip);
      } else {
        // New user creation path
        const { data: newUser, error } = await supabase
          .from('users')
          .insert([{
            email: normalizedEmail,
            email_otp: otp,
            email_otp_expires: otpExpires,
            email_verified: false,
            auth_provider: 'email',
            kyc_status: 'not_submitted'
          }])
          .select()
          .single();

        if (error) throw error;
        await auditService.log('user', newUser.id, 'OTP_REQUESTED_SIGNUP', newUser.id, {}, req.ip);
      }

      // Production ready: Fail gracefully if email service has issues but log it internally
      try {
        await sendOTPEmail(normalizedEmail, otp);
      } catch (mailError: any) {
        console.error('Mail Service Failure:', mailError.message);
        return res.status(503).json({ error: 'Email delivery service temporarily unavailable. Please try again later.' });
      }

      return res.status(200).json({ 
        success: true, 
        message: 'A 6-digit verification code has been sent to your email.' 
      });

    } catch (error: any) {
      console.error('Send Email OTP Error:', error);
      return res.status(500).json({ error: 'Internal server error while processing your request.' });
    }
  }

  static async verifyEmailOTP(req: Request, res: Response): Promise<any> {
    try {
      const { email, otp } = req.body;
      if (!email || !otp) return res.status(400).json({ error: 'Email and OTP code are required.' });

      const normalizedEmail = email.toLowerCase().trim();
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', normalizedEmail)
        .eq('email_otp', otp)
        .maybeSingle();

      if (error || !user) {
        return res.status(401).json({ error: 'The code provided is incorrect.' });
      }

      // Check expiry
      if (new Date() > new Date(user.email_otp_expires)) {
        return res.status(401).json({ error: 'Verification code has expired. Please request a new one.' });
      }

      // Production security: Mark as verified and clear OTP IMMEDIATELY to prevent replay attacks
      const { error: updateError } = await supabase
        .from('users')
        .update({
          email_verified: true,
          email_otp: null,
          email_otp_expires: null
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      const token = generateToken({ id: user.id });
      
      await auditService.log('user', user.id, 'OTP_VERIFIED_AUTH', user.id, {}, req.ip);

      return res.status(200).json({ 
        message: 'Identity verified successfully.', 
        access_token: token,
        user: {
          id: user.id,
          email: user.email,
          kyc_status: user.kyc_status,
          phone: user.phone || null
        }
      });

    } catch (error: any) {
      console.error('Verify Email OTP Error:', error);
      return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
    }
  }
}
