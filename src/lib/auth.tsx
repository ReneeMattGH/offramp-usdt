import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface User {
  id: string;
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  tron_wallet_address: string | null;
}

interface AuthContextType {
  user: User | null;
  sessionToken: string | null;
  isLoading: boolean;
  login: (accountNumber: string, otp: string) => Promise<{ error: string | null }>;
  signup: (accountHolderName: string, accountNumber: string, ifscCode: string, otp: string) => Promise<{ error: string | null }>;
  sendOtp: (accountNumber: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session on load
    const storedToken = localStorage.getItem('session_token');
    const storedUserId = localStorage.getItem('user_id');
    
    if (storedToken && storedUserId) {
      validateSession(storedToken, storedUserId);
    } else {
      setIsLoading(false);
    }
  }, []);

  const validateSession = async (token: string, userId: string) => {
    try {
      // Check if session is valid
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('*')
        .eq('token', token)
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (sessionError || !session) {
        localStorage.removeItem('session_token');
        localStorage.removeItem('user_id');
        setIsLoading(false);
        return;
      }

      // Fetch user data
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError || !userData) {
        localStorage.removeItem('session_token');
        localStorage.removeItem('user_id');
        setIsLoading(false);
        return;
      }

      setUser(userData);
      setSessionToken(token);
    } catch (err) {
      console.error('Session validation error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const sendOtp = async (accountNumber: string): Promise<{ error: string | null }> => {
    try {
      // Fixed OTP for demo purposes
      const otpCode = '123456';
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

      // Store OTP in database
      const { error } = await supabase
        .from('otps')
        .insert({
          account_number: accountNumber,
          otp_code: otpCode,
          expires_at: expiresAt,
        });

      if (error) throw error;

      // In dev, log the OTP for testing (remove in production)
      console.log('OTP for testing:', otpCode);
      
      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'Failed to send OTP' };
    }
  };

  const signup = async (
    accountHolderName: string,
    accountNumber: string,
    ifscCode: string,
    otp: string
  ): Promise<{ error: string | null }> => {
    try {
      // Verify OTP
      const { data: otpData, error: otpError } = await supabase
        .from('otps')
        .select('*')
        .eq('account_number', accountNumber)
        .eq('otp_code', otp)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (otpError || !otpData) {
        return { error: 'Invalid or expired OTP' };
      }

      // Mark OTP as used
      await supabase
        .from('otps')
        .update({ used: true })
        .eq('id', otpData.id);

      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('account_number', accountNumber)
        .single();

      if (existingUser) {
        return { error: 'Account already exists. Please login instead.' };
      }

      // Generate TRON wallet address (mock - in production use TronWeb)
      const walletAddress = 'T' + Array.from({ length: 33 }, () => 
        'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789'[Math.floor(Math.random() * 58)]
      ).join('');

      // Create user
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          account_holder_name: accountHolderName,
          account_number: accountNumber,
          ifsc_code: ifscCode,
          tron_wallet_address: walletAddress,
          encrypted_private_key: 'encrypted_key_placeholder', // In production, properly encrypt
        })
        .select()
        .single();

      if (createError) throw createError;

      // Create session
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

      await supabase
        .from('sessions')
        .insert({
          user_id: newUser.id,
          token,
          expires_at: expiresAt,
        });

      // Store in localStorage
      localStorage.setItem('session_token', token);
      localStorage.setItem('user_id', newUser.id);

      setUser(newUser);
      setSessionToken(token);

      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'Signup failed' };
    }
  };

  const login = async (accountNumber: string, otp: string): Promise<{ error: string | null }> => {
    try {
      // Verify OTP
      const { data: otpData, error: otpError } = await supabase
        .from('otps')
        .select('*')
        .eq('account_number', accountNumber)
        .eq('otp_code', otp)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (otpError || !otpData) {
        return { error: 'Invalid or expired OTP' };
      }

      // Mark OTP as used
      await supabase
        .from('otps')
        .update({ used: true })
        .eq('id', otpData.id);

      // Find user
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('account_number', accountNumber)
        .single();

      if (userError || !userData) {
        return { error: 'Account not found. Please signup first.' };
      }

      // Create session
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await supabase
        .from('sessions')
        .insert({
          user_id: userData.id,
          token,
          expires_at: expiresAt,
        });

      // Store in localStorage
      localStorage.setItem('session_token', token);
      localStorage.setItem('user_id', userData.id);

      setUser(userData);
      setSessionToken(token);

      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'Login failed' };
    }
  };

  const logout = async () => {
    try {
      if (sessionToken) {
        await supabase
          .from('sessions')
          .delete()
          .eq('token', sessionToken);
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      localStorage.removeItem('session_token');
      localStorage.removeItem('user_id');
      setUser(null);
      setSessionToken(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, sessionToken, isLoading, login, signup, sendOtp, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
