import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

interface UserBalance {
  balance: number;
<<<<<<< HEAD
=======
  lockedBalance: number;
>>>>>>> ce6f0a8 (Initial commit)
  pendingSalary: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useUserBalance(): UserBalance {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
<<<<<<< HEAD
=======
  const [lockedBalance, setLockedBalance] = useState(0);
>>>>>>> ce6f0a8 (Initial commit)
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
<<<<<<< HEAD
      // Get balance from database function (derived from ledger)
      const { data: balanceData, error: balanceError } = await supabase.rpc(
        'get_user_balance',
        { p_user_id: user.id }
      );

      if (balanceError) {
        throw balanceError;
      }

      setBalance(balanceData || 0);

=======
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

>>>>>>> ce6f0a8 (Initial commit)
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

<<<<<<< HEAD
    // Subscribe to ledger changes for real-time balance updates
    const channel = supabase
      .channel('balance-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ledger',
=======
    // Subscribe to ledger_accounts changes for real-time balance updates
    const channel = supabase
      .channel('ledger-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ledger_accounts',
>>>>>>> ce6f0a8 (Initial commit)
          filter: `user_id=eq.${user?.id}`,
        },
        () => {
          fetchBalance();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'salary_transactions',
          filter: `user_id=eq.${user?.id}`,
        },
        () => {
          fetchBalance();
        }
      )
      .subscribe();

    // Poll every 30 seconds as backup
    const interval = setInterval(fetchBalance, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchBalance, user?.id]);

<<<<<<< HEAD
  return { balance, pendingSalary, isLoading, error, refetch: fetchBalance };
=======
  return {
    balance,
    lockedBalance,
    pendingSalary,
    isLoading,
    error,
    refetch: fetchBalance,
  };
>>>>>>> ce6f0a8 (Initial commit)
}
