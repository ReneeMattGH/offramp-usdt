import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  tron_wallet_address: string | null;
  kyc_status?: 'not_submitted' | 'pending' | 'approved' | 'rejected';
  pan_number?: string | null;
  kyc_verified_at?: string | null;
  referral_code?: string;
  referral_points?: number;
}

interface AuthContextType {
  user: User | null;
  sessionToken: string | null;
  isLoading: boolean;
  login: (accountNumber: string, otp: string) => Promise<{ error: string | null }>;
  signup: (accountHolderName: string, accountNumber: string, ifscCode: string, otp: string, referralCode?: string) => Promise<{ error: string | null }>;
  sendOtp: (accountNumber: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(
    localStorage.getItem('auth_token') || localStorage.getItem('token')
  );
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserData = async () => {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    
    if (token) {
      try {
        const response = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData as unknown as User);
          setSessionToken(token);
          setIsLoading(false);
          return;
        }

        if (response.status === 401) {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('user_data');
          localStorage.removeItem('token');
          setSessionToken(null);
          setUser(null);
          window.location.href = '/login';
          return;
        }

        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        localStorage.removeItem('token');
        setSessionToken(null);
        setUser(null);
      } catch (error) {
        console.error('Error fetching user data:', error);
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        localStorage.removeItem('token');
        setSessionToken(null);
        setUser(null);
      }
    }

    setIsLoading(false);
  };

  const refreshUser = async () => {
    await fetchUserData();
  };

  useEffect(() => {
    fetchUserData();
  }, []);

  const login = async (accountNumber: string, otp: string): Promise<{ error: string | null }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountNumber, otp })
      });
      const data = await res.json();

      if (res.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        localStorage.removeItem('token');
        window.location.href = '/login';
        return { error: 'Unauthorized. Please log in again.' };
      }

      if (!res.ok || !data.success) {
        return { error: data.error || 'Login failed' };
      }

      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('user_data', JSON.stringify(data.user));
      localStorage.setItem('token', data.token);
      setSessionToken(data.token);
      setUser(data.user);
      return { error: null };
    } catch (e: any) {
      return { error: e.message };
    }
  };

  const signup = async (
    accountHolderName: string,
    accountNumber: string,
    ifscCode: string,
    otp: string,
    referralCode?: string
  ): Promise<{ error: string | null }> => {
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountHolderName, accountNumber, ifscCode, otp, referralCode })
      });
      const data = await res.json();

      if (res.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        localStorage.removeItem('token');
        window.location.href = '/login';
        return { error: 'Unauthorized. Please log in again.' };
      }

      if (!res.ok) {
        return { error: data.error || 'Signup failed' };
      }

      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('user_data', JSON.stringify(data.user));
      localStorage.setItem('token', data.token);
      setSessionToken(data.token);
      setUser(data.user);
      return { error: null };
    } catch (e: any) {
      return { error: e.message };
    }
  };

  const sendOtp = async (accountNumber: string): Promise<{ error: string | null }> => {
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountNumber })
      });
      const data = await res.json();

      if (res.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        localStorage.removeItem('token');
        window.location.href = '/login';
        return { error: 'Unauthorized. Please log in again.' };
      }

      if (!res.ok) {
        return { error: data.error || 'Failed to send OTP' };
      }

      return { error: null };
    } catch (e: any) {
      return { error: e.message };
    }
  };

  const logout = async () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    localStorage.removeItem('token');
    setSessionToken(null);
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{
      user,
      sessionToken,
      isLoading,
      login,
      signup,
      sendOtp,
      logout,
      refreshUser
    }}>
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
