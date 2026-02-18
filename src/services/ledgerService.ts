import supabase from '../utils/supabase.js';

export class LedgerService {
  private static instance: LedgerService;

  private constructor() {}

  public static getInstance(): LedgerService {
    if (!LedgerService.instance) {
      LedgerService.instance = new LedgerService();
    }
    return LedgerService.instance;
  }

  async ensureAccount(userId: string): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('ledger_accounts')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) throw error;

      if (!data) {
        await supabase.from('ledger_accounts').insert({
          user_id: userId,
          available_balance: 0,
          locked_balance: 0,
          settled_balance: 0
        });
      }
    } catch (e: any) {
      console.error('Ledger account sync failed:', e.message);
    }
  }

  async getWalletBalance(userId: string) {
    try {
      const { data, error } = await supabase.rpc('get_calculated_balance', { p_user_id: userId });
      
      if (error) throw error;
      
      return {
        available: data.calculated_available,
        locked: data.calculated_locked,
        is_consistent: data.is_consistent
      };
    } catch (err: any) {
      console.error('Balance fetch failed:', err.message);
      return { available: 0, locked: 0, is_consistent: true };
    }
  }

  async getLedgerHistory(userId: string, limit: number = 50) {
    const { data, error } = await supabase
      .from('ledger_entries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data;
  }

  async creditDeposit(userId: string, amount: number, txHash: string, description: string = 'Deposit'): Promise<boolean> {
    try {
      await this.ensureAccount(userId);
      
      const { data, error } = await supabase.rpc('credit_deposit', {
        p_user_id: userId,
        p_amount: amount,
        p_tx_hash: txHash,
        p_description: description
      });

      if (error) throw error;
      return data.success;
    } catch (error) {
      console.error('Deposit credit failed:', error);
      throw error;
    }
  }

  async lockPayoutFunds(userId: string, amount: number, orderId: string) {
    const { data, error } = await supabase.rpc('lock_payout_funds', {
      p_user_id: userId,
      p_amount: amount,
      p_order_id: orderId,
      p_description: `Payout Lock for Order ${orderId}`
    });
    if (error) throw error;
    return data;
  }

  async finalizePayout(userId: string, amount: number, orderId: string) {
    const { data, error } = await supabase.rpc('finalize_payout', {
      p_user_id: userId,
      p_amount: amount,
      p_order_id: orderId
    });
    if (error) throw error;
    return data;
  }

  async failPayout(userId: string, amount: number, orderId: string) {
    const { data, error } = await supabase.rpc('fail_payout', {
      p_user_id: userId,
      p_amount: amount,
      p_order_id: orderId
    });
    if (error) throw error;
    return data;
  }

  async lockFundsForExchange(userId: string, amount: number, exchangeId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('lock_funds', {
      p_user_id: userId,
      p_amount: amount,
      p_ref_id: exchangeId,
      p_description: 'Locked for Exchange'
    });
    if (error) throw error;
    if (!data.success) throw new Error(data.message || 'Lock failed');
    return true;
  }

  async lockFundsForWithdrawal(userId: string, amount: number, withdrawalId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('lock_funds', {
      p_user_id: userId,
      p_amount: amount,
      p_ref_id: withdrawalId,
      p_description: 'USDT Withdrawal Lock'
    });
    if (error) throw error;
    if (!data.success) throw new Error(data.message || 'Lock failed');
    return true;
  }

  async finalizeWithdrawal(userId: string, amount: number, withdrawalId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('finalize_withdrawal', {
      p_user_id: userId,
      p_amount: amount,
      p_withdrawal_id: withdrawalId
    });
    if (error) throw error;
    return data.success;
  }

  async failWithdrawal(userId: string, amount: number, withdrawalId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('fail_withdrawal', {
      p_user_id: userId,
      p_amount: amount,
      p_withdrawal_id: withdrawalId
    });
    if (error) throw error;
    return data.success;
  }

  async settleExchange(userId: string, amount: number, exchangeId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('settle_exchange', {
      p_user_id: userId,
      p_amount: amount,
      p_ref_id: exchangeId
    });
    if (error) throw error;
    return true;
  }

  async refundExchange(userId: string, amount: number, exchangeId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('refund_exchange', {
      p_user_id: userId,
      p_amount: amount,
      p_ref_id: exchangeId
    });
    if (error) throw error;
    return true;
  }
}

export default LedgerService.getInstance();
