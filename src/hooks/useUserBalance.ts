import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

interface UserBalance {
  balance: number;
  pendingSalary: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useUserBalance(): UserBalance {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
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
      // Get balance from database function (derived from ledger)
      const { data: balanceData, error: balanceError } = await supabase.rpc(
        'get_user_balance',
        { p_user_id: user.id }
      );

      if (balanceError) {
        throw balanceError;
      }

      setBalance(balanceData || 0);

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

    // Subscribe to ledger changes for real-time balance updates
    const channel = supabase
      .channel('balance-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ledger',
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

  return { balance, pendingSalary, isLoading, error, refetch: fetchBalance };
}
