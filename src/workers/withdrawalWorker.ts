import supabase from '../utils/supabase.js';
import tronService from '../services/tronService.js';

export class WithdrawalWorker {
  private static instance: WithdrawalWorker;
  private isProcessing: boolean = false;
  private timer: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): WithdrawalWorker {
    if (!WithdrawalWorker.instance) {
      WithdrawalWorker.instance = new WithdrawalWorker();
    }
    return WithdrawalWorker.instance;
  }

  public start() {
    console.log('[WITHDRAWAL_WORKER] Starting withdrawal queue processor...');
    this.timer = setInterval(() => this.processWithdrawals(), 30000);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async processWithdrawals() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // 1. Process pending withdrawals
      const { data: pending, error } = await supabase
        .from('usdt_withdrawals')
        .select('*')
        .eq('status', 'pending')
        .limit(5);

      if (error) throw error;

      if (pending) {
        for (const withdrawal of pending) {
          await this.executeWithdrawal(withdrawal);
        }
      }

      // 2. Check confirming withdrawals
      const { data: confirming, error: confError } = await supabase
        .from('usdt_withdrawals')
        .select('*')
        .eq('status', 'processing')
        .not('tx_hash', 'is', null);

      if (confError) throw confError;

      if (confirming) {
        for (const withdrawal of confirming) {
          await this.checkConfirmation(withdrawal);
        }
      }
    } catch (err) {
      console.error('[WITHDRAWAL_WORKER] Error:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeWithdrawal(withdrawal: any) {
    try {
      await supabase
        .from('usdt_withdrawals')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', withdrawal.id);

      const txHash = await tronService.sendUSDT(withdrawal.destination_address, withdrawal.usdt_amount);

      if (txHash) {
        await supabase
          .from('usdt_withdrawals')
          .update({ tx_hash: txHash, updated_at: new Date().toISOString() })
          .eq('id', withdrawal.id);
        console.log(`[WITHDRAWAL_WORKER] Withdrawal ${withdrawal.id} broadcasted: ${txHash}`);
      } else {
        await supabase
          .from('usdt_withdrawals')
          .update({ 
            status: 'failed', 
            failure_reason: 'Broadcast failed', 
            updated_at: new Date().toISOString() 
          })
          .eq('id', withdrawal.id);
      }
    } catch (error: any) {
      console.error(`[WITHDRAWAL_WORKER] Execution failed for ${withdrawal.id}:`, error.message);
    }
  }

  private async checkConfirmation(withdrawal: any) {
    try {
      const status = await tronService.checkConfirmation(withdrawal.tx_hash);
      
      if (status === 'confirmed') {
        await supabase
          .from('usdt_withdrawals')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', withdrawal.id);
        console.log(`[WITHDRAWAL_WORKER] Withdrawal ${withdrawal.id} confirmed`);
      } else if (status === 'failed') {
        await supabase
          .from('usdt_withdrawals')
          .update({ 
            status: 'failed', 
            failure_reason: 'Chain failure', 
            updated_at: new Date().toISOString() 
          })
          .eq('id', withdrawal.id);
        console.error(`[WITHDRAWAL_WORKER] Withdrawal ${withdrawal.id} failed on chain`);
      }
    } catch (error: any) {
      console.error(`[WITHDRAWAL_WORKER] Confirmation check failed for ${withdrawal.id}:`, error.message);
    }
  }
}

export default WithdrawalWorker.getInstance();
