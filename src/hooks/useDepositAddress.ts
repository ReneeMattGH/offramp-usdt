import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

interface DepositAddress {
  id: string;
  tron_address: string;
  expires_at: string;
  created_at: string;
}

export function useDepositAddress() {
  const { user, sessionToken } = useAuth();
  const userId = user?.id;
  
  const [address, setAddress] = useState<DepositAddress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  const fetchOrCreateAddress = useCallback(async () => {
    if (!userId || !sessionToken) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    
    try {
      // Call the backend API to generate a real address
      // Use relative path to leverage Vite proxy
      const response = await fetch('/api/generate-address', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({}), // No need to send user_id, it's in the token
      });

      const data = await response.json();

      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        localStorage.removeItem('token');
        window.location.href = '/login';
        return;
      }

      if (!response.ok) {
        if (data.error === 'KYC_REQUIRED') {
            toast.error(data.message || 'KYC Verification Required');
            setTimeout(() => window.location.href = '/settings', 1500);
        }
        throw new Error(data.error || 'Failed to generate address');
      }

      const newDepositAddress = data.address;

      setAddress({
        id: newDepositAddress.id,
        tron_address: newDepositAddress.tron_address,
        expires_at: newDepositAddress.expires_at,
        created_at: newDepositAddress.created_at,
      });

    } catch (err) {
      console.error('Error creating new address:', err);
      // Optional: toast.error('Failed to generate deposit address');
    } finally {
      setIsLoading(false);
    }
  }, [userId, sessionToken]);

  // Calculate time remaining until expiry
  useEffect(() => {
    if (!address) return;

    const updateTimeRemaining = () => {
      const expiresAt = new Date(address.expires_at).getTime();
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setTimeRemaining(remaining);

      // If expired, fetch new address
      if (remaining <= 0) {
        fetchOrCreateAddress();
      }
    };

    updateTimeRemaining();
    const interval = setInterval(updateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [address, fetchOrCreateAddress]);

  // Initial fetch
  useEffect(() => {
    fetchOrCreateAddress();
  }, [fetchOrCreateAddress]);

  const formatTimeRemaining = (): string => {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return {
    address: address?.tron_address || '',
    expiresAt: address?.expires_at || '',
    timeRemaining,
    formatTimeRemaining,
    isLoading,
    refresh: fetchOrCreateAddress,
  };
}
