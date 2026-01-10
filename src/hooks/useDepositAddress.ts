import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface DepositAddress {
  id: string;
  tron_address: string;
  expires_at: string;
  created_at: string;
}

// Generate a mock TRON address (in production, use TronWeb)
const generateMockTronAddress = (): { address: string; privateKey: string } => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789';
  let address = 'T';
  for (let i = 0; i < 33; i++) {
    address += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Generate mock private key (64 hex chars)
  const hexChars = '0123456789abcdef';
  let privateKey = '';
  for (let i = 0; i < 64; i++) {
    privateKey += hexChars.charAt(Math.floor(Math.random() * hexChars.length));
  }
  
  return { address, privateKey };
};

// Simple encryption for demo (in production, use proper encryption)
const encryptPrivateKey = (privateKey: string): string => {
  return btoa(privateKey);
};

export function useDepositAddress(userId: string | null) {
  const [address, setAddress] = useState<DepositAddress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  const fetchOrCreateAddress = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    
    try {
      // First, check for an active (non-expired) address
      const now = new Date().toISOString();
      
      const { data: existingAddress, error: fetchError } = await supabase
        .from('deposit_addresses')
        .select('*')
        .eq('user_id', userId)
        .eq('is_used', false)
        .gt('expires_at', now)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        console.error('Error fetching deposit address:', fetchError);
        throw fetchError;
      }

      if (existingAddress) {
        setAddress({
          id: existingAddress.id,
          tron_address: existingAddress.tron_address,
          expires_at: existingAddress.expires_at,
          created_at: existingAddress.created_at,
        });
      } else {
        await createNewAddress();
      }
    } catch (err) {
      console.error('Error in useDepositAddress:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const createNewAddress = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    
    try {
      // Mark all old addresses as used
      await supabase
        .from('deposit_addresses')
        .update({ is_used: true })
        .eq('user_id', userId);

        // Generate new address
        const { address: newAddress, privateKey } = generateMockTronAddress();
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes

        const { data: newDepositAddress, error: insertError } = await supabase
          .from('deposit_addresses')
          .insert({
            user_id: userId,
            tron_address: newAddress,
            private_key_encrypted: encryptPrivateKey(privateKey),
            expires_at: expiresAt,
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error creating deposit address:', insertError);
          throw insertError;
        }

        setAddress({
          id: newDepositAddress.id,
          tron_address: newDepositAddress.tron_address,
          expires_at: newDepositAddress.expires_at,
          created_at: newDepositAddress.created_at,
      });

      setAddress({
        id: newDepositAddress.id,
        tron_address: newDepositAddress.tron_address,
        expires_at: newDepositAddress.expires_at,
        created_at: newDepositAddress.created_at,
      });
    } catch (err) {
      console.error('Error creating new address:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

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
    refresh: createNewAddress,
  };
}
