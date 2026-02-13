const supabase = require('../utils/supabase');
const tronService = require('./tronService');
const ledgerService = require('./ledgerService');
const auditService = require('./auditService');

class WithdrawalWorker {
    constructor() {
        this.isProcessing = false;
        this.interval = 30000;
    }

    start() {
        setInterval(() => this.processPendingWithdrawals(), this.interval);
        setInterval(() => this.processConfirmingWithdrawals(), this.interval);
    }

    async processConfirmingWithdrawals() {
        try {
             const { data: processing, error } = await supabase
                .from('usdt_withdrawals')
                .select('*')
                .eq('status', 'processing')
                .not('tx_hash', 'is', null);

             if (error || !processing?.length) return;

             for (const withdrawal of processing) {
                 const status = await tronService.checkConfirmation(withdrawal.tx_hash);
                 
                 if (status === 'confirmed') {
                     const total = parseFloat(withdrawal.usdt_amount) + parseFloat(withdrawal.fee);
                     await ledgerService.finalizeWithdrawal(withdrawal.user_id, total, withdrawal.id);

                     await supabase.from('usdt_withdrawals')
                         .update({ status: 'completed', updated_at: new Date().toISOString() })
                         .eq('id', withdrawal.id);
                     
                     await auditService.log('system', withdrawal.user_id, 'USDT_WITHDRAW_COMPLETED', withdrawal.id, { txHash: withdrawal.tx_hash });

                 } else if (status === 'failed') {
                     const total = parseFloat(withdrawal.usdt_amount) + parseFloat(withdrawal.fee);
                     await ledgerService.failWithdrawal(withdrawal.user_id, total, withdrawal.id);

                     await supabase.from('usdt_withdrawals')
                         .update({ 
                             status: 'failed', 
                             failure_reason: 'Chain failure',
                             updated_at: new Date().toISOString() 
                         })
                         .eq('id', withdrawal.id);

                     await auditService.log('system', withdrawal.user_id, 'USDT_WITHDRAW_FAILED_ONCHAIN', withdrawal.id, { txHash: withdrawal.tx_hash });
                 }
             }
        } catch (err) {
            console.error('Confirm worker error:', err.message);
        }
    }

    async processPendingWithdrawals() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            const { data: pending, error } = await supabase
                .from('usdt_withdrawals')
                .select('*')
                .eq('status', 'pending')
                .limit(5);

            if (error || !pending?.length) {
                this.isProcessing = false;
                return;
            }

            for (const withdrawal of pending) {
                await this.executeWithdrawal(withdrawal);
            }
        } catch (err) {
            console.error('Pending worker error:', err.message);
        } finally {
            this.isProcessing = false;
        }
    }

    async executeWithdrawal(withdrawal) {
        try {
            const { error: updateError } = await supabase
                .from('usdt_withdrawals')
                .update({ status: 'processing', updated_at: new Date().toISOString() })
                .eq('id', withdrawal.id)
                .eq('status', 'pending');

            if (updateError) return;

            const txHash = await tronService.sendUSDT(withdrawal.destination_address, withdrawal.usdt_amount);

            if (txHash) {
                await supabase.from('usdt_withdrawals')
                    .update({ tx_hash: txHash, updated_at: new Date().toISOString() })
                    .eq('id', withdrawal.id);

                await auditService.log('system', withdrawal.user_id, 'USDT_WITHDRAW_BROADCAST', withdrawal.id, { txHash });
            }
        } catch (err) {
            console.error(`Withdrawal ${withdrawal.id} error:`, err.message);
            const retries = (withdrawal.retry_count || 0) + 1;

            if (retries < 3) {
                await supabase.from('usdt_withdrawals')
                    .update({ 
                        status: 'pending', 
                        retry_count: retries,
                        failure_reason: err.message,
                        updated_at: new Date().toISOString() 
                    })
                    .eq('id', withdrawal.id);
            } else {
                await supabase.from('usdt_withdrawals')
                    .update({ status: 'failed', failure_reason: err.message, updated_at: new Date().toISOString() })
                    .eq('id', withdrawal.id);

                const total = parseFloat(withdrawal.usdt_amount) + parseFloat(withdrawal.fee);
                await ledgerService.failWithdrawal(withdrawal.user_id, total, withdrawal.id);
                await auditService.log('system', withdrawal.user_id, 'USDT_WITHDRAW_FAILED', withdrawal.id, { error: err.message });
            }
        }
    }
}

module.exports = new WithdrawalWorker();
