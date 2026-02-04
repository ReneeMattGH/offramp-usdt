const { createClient } = require('@supabase/supabase-js');
const tronService = require('./tronService');
const ledgerService = require('./ledgerService');
const auditService = require('./auditService');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

class WithdrawalWorker {
    constructor() {
        this.isProcessing = false;
        this.interval = 30000; // 30 seconds
    }

    start() {
        console.log('[WithdrawalWorker] Started');
        setInterval(() => this.processPendingWithdrawals(), this.interval);
        setInterval(() => this.processConfirmingWithdrawals(), this.interval);
    }

    async processConfirmingWithdrawals() {
        try {
             // 1. Get withdrawals that are 'processing' and have a tx_hash
             let processingWithdrawals = [];
             const { data: dbProcessing, error } = await supabase
                .from('usdt_withdrawals')
                .select('*')
                .eq('status', 'processing')
                .not('tx_hash', 'is', null);

             if (error) {
                 if (error.code === 'PGRST205' || error.message?.includes('Could not find the table')) {
                     // Silent return for missing table
                     return;
                 }
                 console.error('[WithdrawalWorker] Error fetching processing:', error);
                 return;
             } else {
                 processingWithdrawals = dbProcessing;
             }

             if (!processingWithdrawals || processingWithdrawals.length === 0) return;

             for (const withdrawal of processingWithdrawals) {
                 const status = await tronService.checkConfirmation(withdrawal.tx_hash);
                 
                 if (status === 'confirmed') {
                     console.log(`[WithdrawalWorker] Withdrawal ${withdrawal.id} CONFIRMED.`);
                     
                     // Finalize Ledger
                     const totalFinalized = parseFloat(withdrawal.usdt_amount) + parseFloat(withdrawal.fee);
                     await ledgerService.finalizeWithdrawal(withdrawal.user_id, totalFinalized, withdrawal.id);

                     // Update DB
                     await supabase.from('usdt_withdrawals')
                         .update({ status: 'completed', updated_at: new Date().toISOString() })
                         .eq('id', withdrawal.id);
                     
                     await auditService.log('system', withdrawal.user_id, 'USDT_WITHDRAW_COMPLETED', withdrawal.id, { txHash: withdrawal.tx_hash }, '127.0.0.1');

                 } else if (status === 'failed') {
                     console.log(`[WithdrawalWorker] Withdrawal ${withdrawal.id} FAILED on-chain.`);
                     
                     // Refund Ledger
                     const totalToRefund = parseFloat(withdrawal.usdt_amount) + parseFloat(withdrawal.fee);
                     await ledgerService.failWithdrawal(withdrawal.user_id, totalToRefund, withdrawal.id);

                     // Update DB
                     await supabase.from('usdt_withdrawals')
                         .update({ 
                             status: 'failed', 
                             failure_reason: 'On-chain transaction failed',
                             updated_at: new Date().toISOString() 
                         })
                         .eq('id', withdrawal.id);

                     await auditService.log('system', withdrawal.user_id, 'USDT_WITHDRAW_FAILED_ONCHAIN', withdrawal.id, { txHash: withdrawal.tx_hash }, '127.0.0.1');
                 }
                 // If 'pending', do nothing, wait for next cycle
             }

        } catch (err) {
            console.error('[WithdrawalWorker] Error processing confirming withdrawals:', err);
        }
    }

    async processPendingWithdrawals() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            // 1. Pick pending withdrawals
            let pendingWithdrawals = [];
            const { data: dbPending, error } = await supabase
                .from('usdt_withdrawals')
                .select('*')
                .eq('status', 'pending')
                .limit(5); // Process in batches

            if (error) {
                // Supabase error for missing table
                if (error.code === 'PGRST205' || error.message?.includes('Could not find the table')) {
                     console.warn('[WithdrawalWorker] Table usdt_withdrawals missing. Skipping worker cycle.');
                     this.isProcessing = false;
                     return;
                }
                console.error('[WithdrawalWorker] Error fetching pending:', error);
                this.isProcessing = false;
                return;
            } else {
                pendingWithdrawals = dbPending;
            }

            if (!pendingWithdrawals || pendingWithdrawals.length === 0) {
                this.isProcessing = false;
                return;
            }

            for (const withdrawal of pendingWithdrawals) {
                await this.executeWithdrawal(withdrawal);
            }

        } catch (err) {
            console.error('[WithdrawalWorker] Fatal Error:', err);
        } finally {
            this.isProcessing = false;
        }
    }

    async executeWithdrawal(withdrawal) {
        console.log(`[WithdrawalWorker] Processing withdrawal ${withdrawal.id} for user ${withdrawal.user_id}`);
        
        try {
            // 1. Update status to 'processing' to prevent double-processing
            if (usdtWithdrawalsStore.find(w => w.id === withdrawal.id)) {
                 const w = usdtWithdrawalsStore.find(w => w.id === withdrawal.id);
                 if (w.status !== 'pending') return; // Already picked by another worker cycle (simulated)
                 w.status = 'processing';
                 w.updated_at = new Date().toISOString();
            } else {
                const { error: updateError } = await supabase
                    .from('usdt_withdrawals')
                    .update({ status: 'processing', updated_at: new Date().toISOString() })
                    .eq('id', withdrawal.id)
                    .eq('status', 'pending'); // Optimistic lock

                if (updateError) throw updateError;
            }

            // 2. Send USDT via TronService
            // amount to send is usdt_amount (fee is kept by system)
            const txHash = await tronService.sendUSDT(withdrawal.destination_address, withdrawal.usdt_amount);

            if (txHash) {
                // 3. Update with TX Hash but keep as PROCESSING (wait for confirmation)
                const { error: finalError } = await supabase
                    .from('usdt_withdrawals')
                    .update({ 
                        tx_hash: txHash,
                        updated_at: new Date().toISOString() 
                    })
                    .eq('id', withdrawal.id);

                if (finalError) throw finalError;

                await auditService.log('system', withdrawal.user_id, 'USDT_WITHDRAW_BROADCAST', withdrawal.id, { txHash }, '127.0.0.1');
                console.log(`[WithdrawalWorker] Withdrawal ${withdrawal.id} BROADCAST. TX: ${txHash}. Waiting for confirmation.`);
            }

        } catch (err) {
            console.error(`[WithdrawalWorker] Error processing withdrawal ${withdrawal.id}:`, err);
            
            // Retry Logic
            const currentRetryCount = withdrawal.retry_count || 0;
            const maxRetries = 3;

            if (currentRetryCount < maxRetries) {
                console.log(`[WithdrawalWorker] Retrying withdrawal ${withdrawal.id} (Attempt ${currentRetryCount + 1}/${maxRetries})`);
                
                // Set back to pending and increment retry_count
                if (usdtWithdrawalsStore.find(w => w.id === withdrawal.id)) {
                    const w = usdtWithdrawalsStore.find(w => w.id === withdrawal.id);
                    w.status = 'pending';
                    w.retry_count = currentRetryCount + 1;
                    w.failure_reason = err.message; // Keep last error
                    w.updated_at = new Date().toISOString();
                } else {
                    // Note: This assumes retry_count column exists. If not, this might fail, but since we can't migrate, we rely on try/catch or store fallback
                    const { error: retryError } = await supabase
                        .from('usdt_withdrawals')
                        .update({ 
                            status: 'pending', 
                            retry_count: currentRetryCount + 1,
                            failure_reason: err.message,
                            updated_at: new Date().toISOString() 
                        })
                        .eq('id', withdrawal.id);
                        
                    if (retryError) console.error('[WithdrawalWorker] Failed to update retry count DB:', retryError);
                }
                
                // Do NOT refund yet, just retry
                return;
            }

            // 5. Handle Final Failure
            if (usdtWithdrawalsStore.find(w => w.id === withdrawal.id)) {
                 const w = usdtWithdrawalsStore.find(w => w.id === withdrawal.id);
                 w.status = 'failed';
                 w.failure_reason = err.message;
                 w.updated_at = new Date().toISOString();
            } else {
                const { error: failError } = await supabase
                    .from('usdt_withdrawals')
                    .update({ 
                        status: 'failed', 
                        failure_reason: err.message,
                        updated_at: new Date().toISOString() 
                    })
                    .eq('id', withdrawal.id);
            }

            // 6. Refund/Unlock funds in Ledger
            const totalToRefund = parseFloat(withdrawal.usdt_amount) + parseFloat(withdrawal.fee);
            await ledgerService.failWithdrawal(withdrawal.user_id, totalToRefund, withdrawal.id);

            await auditService.log('system', withdrawal.user_id, 'USDT_WITHDRAW_FAILED', withdrawal.id, { error: err.message, retries: currentRetryCount }, '127.0.0.1');
        }
    }
}

module.exports = new WithdrawalWorker();
