import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface User {
  id: string;
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  tron_wallet_address: string | null;
  kyc_status?: 'not_submitted' | 'pending' | 'approved' | 'rejected';
  pan_number?: string | null;
  kyc_verified_at?: string | null;
}

interface AuthContextType {
  user: User | null;
  sessionToken: string | null;
  isLoading: boolean;
  login: (accountNumber: string, otp: string) => Promise<{ error: string | null }>;
  signup: (accountHolderName: string, accountNumber: string, ifscCode: string, otp: string) => Promise<{ error: string | null }>;
  sendOtp: (accountNumber: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize with a default user immediately (Bypass Auth)
  const [user, setUser] = useState<User | null>({
    id: 'mock-user-id',
    account_holder_name: 'Guest User',
    account_number: 'DEMO_USER_001',
    ifsc_code: 'DEMO0001',
    tron_wallet_address: null,
    kyc_status: 'not_submitted' // Default, will update from backend
  });
  const [sessionToken, setSessionToken] = useState<string | null>('mock-session-token');
  const [isLoading, setIsLoading] = useState(false);

  const fetchUserData = async (userId: string) => {
    try {
      // Fetch latest user data (including KYC status) from backend
      // Backend authMiddleware now ignores token and always returns the demo user
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer mock-token` 
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }

      const userData = await response.json();
      // Update user state with fresh data from DB (e.g. KYC status)
      setUser(userData as unknown as User);
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  const refreshUser = async () => {
    await fetchUserData('mock-user-id');
  };

  const autoLogin = async () => {
    // No-op: We are always logged in
    await refreshUser();
  };

  useEffect(() => {
    // On mount, sync with backend to get real KYC status
    refreshUser();
    
    // Subscribe to realtime changes for the user (if we have a real ID from backend)
    // For now, we'll skip complex realtime subscriptions unless we confirm the ID
  }, []);

  const login = async (accountNumber: string, otp: string): Promise<{ error: string | null }> => {
    return { error: null };
  };

  const signup = async (
    accountHolderName: string,
    accountNumber: string,
    ifscCode: string,
    otp: string
  ): Promise<{ error: string | null }> => {
    return { error: null };
  };

  const sendOtp = async (accountNumber: string): Promise<{ error: string | null }> => {
    return { error: null };
  };

  const logout = async () => {
    // In this Demo/Guest mode, "logout" means resetting the session to a fresh state.
    // We will reset the KYC status on the backend so the user can try again.
    try {
      await fetch('/api/debug/reset-kyc', { method: 'POST' });
      // Force reload to re-fetch the fresh user state (which will be 'not_submitted')
      window.location.reload();
    } catch (e) {
      console.error('Logout reset failed:', e);
      window.location.reload();
    }
  };

  return (
    <AuthContext.Provider value={{ user, sessionToken, isLoading, login, signup, sendOtp, logout, refreshUser }}>
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
