import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

interface UserBalance {
  balance: number;
  lockedBalance: number;
  pendingSalary: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useUserBalance(): UserBalance {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [lockedBalance, setLockedBalance] = useState(0);
  const [pendingSalary, setPendingSalary] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get balance from ledger_accounts (Real-time Ledger)
      const { data: accountData, error: accountError } = await supabase
        .from('ledger_accounts' as any)
        .select('available_balance, locked_balance')
        .eq('user_id', user.id)
        .maybeSingle();

      // If ledger exists and user has account, use it.
      // If table doesn't exist (error) or user has no account (null), fallback to dummy.
      
      if (!accountError && accountData) {
        // Ledger exists and user has account, use it as source of truth
        setBalance((accountData as any)?.available_balance || 0);
        setLockedBalance((accountData as any)?.locked_balance || 0);
      } else {
        // Fallback: Ledger not initialized (Demo Mode) or Table missing
        if (accountError) {
             console.warn('Ledger table missing or error, using fallback:', accountError.message);
        }
        
        // Check local storage for demo balance state
        const spentDummy = parseFloat(localStorage.getItem('dummy_spent') || '0');
        const dummyBalance = Math.max(0, 1000 - spentDummy);
        setBalance(dummyBalance);
        setLockedBalance(0); // No locked balance in demo mode fallback
      }

      // Get pending salary transactions
      const { data: pendingTxs, error: pendingError } = await supabase
        .from('salary_transactions')
        .select('amount_usdt')
        .eq('user_id', user.id)
        .in('status', ['initiated', 'broadcasted']);

      if (pendingError) {
        console.error('Error fetching pending salary:', pendingError);
      } else {
        const totalPending = pendingTxs?.reduce((sum, tx) => sum + tx.amount_usdt, 0) || 0;
        setPendingSalary(totalPending);
      }

    } catch (err: any) {
      console.error('Error fetching balance:', err);
      setError(err.message || 'Failed to fetch balance');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchBalance();
    
    // Subscribe to changes
    const channel = supabase
      .channel('balance-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ledger_accounts',
          filter: `user_id=eq.${user?.id}`,
        },
        () => fetchBalance()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchBalance, user?.id]);

  return { 
    balance, 
    lockedBalance,
    pendingSalary, 
    isLoading, 
    error,
    refetch: fetchBalance 
  };
}
