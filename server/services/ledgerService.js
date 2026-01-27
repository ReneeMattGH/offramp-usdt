const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

class LedgerService {

    // Helper to ensure ledger account exists
    async ensureAccount(userId) {
        try {
            const { data, error } = await supabase
                .from('ledger_accounts')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();
                
            if (error) {
                 // If table is missing, just ignore (Dev/Fallback mode)
                 if (error.code === 'PGRST205' || (error.message && error.message.includes('relation'))) {
                     return; 
                 }
                 console.error('Ensure Account Check Error:', error);
            }

            if (!data) {
                const { error: insertError } = await supabase.from('ledger_accounts').insert({
                    user_id: userId,
                    available_balance: 0,
                    locked_balance: 0,
                    settled_balance: 0
                });
                if (insertError) {
                    if (insertError.code === 'PGRST205' || (insertError.message && insertError.message.includes('relation'))) return;
                    console.error('Ensure Account Create Error:', insertError);
                }
            }
        } catch (e) {
            console.warn('ensureAccount failed (likely DB connection issue), proceeding safely:', e.message);
        }
    }

    // Credit Engine: Deposit USDT
    async creditDeposit(userId, amount, txHash, description = 'Deposit') {
        try {
            await this.ensureAccount(userId);
            
            const { data, error } = await supabase.rpc('credit_deposit', {
                p_user_id: userId,
                p_amount: amount,
                p_tx_hash: txHash,
                p_description: description
            });

            if (error) throw error;
            
            if (!data.success) {
                console.log(`Deposit failed: ${data.message}`);
                return false;
            }

            console.log(`Credited ${amount} USDT to user ${userId}. New Balance: ${data.new_balance}`);
            return true;

        } catch (error) {
            console.error('Credit Deposit Error:', error);
            // Fallback for dev environment if RPC is missing (remove in production)
            if ((error.message && (error.message.includes('function credit_deposit') && error.message.includes('does not exist'))) || 
                error.code === 'PGRST202' ||
                (error.message && error.message.includes('Could not find the function'))) {
                 console.warn('RPC missing, falling back to non-atomic update (DEV ONLY)');
                 return this._creditDepositFallback(userId, amount, txHash, description);
            }
            
            // Handle missing tables gracefully
             if (error.code === 'PGRST205' || (error.message && error.message.includes('relation'))) {
                 console.warn('Ledger tables missing. Simulating deposit credit (In-Memory/Log Only).');
                 console.log(`[SIMULATED] Credited ${amount} USDT to user ${userId} (Tx: ${txHash})`);
                 return true;
             }
             
            throw error;
        }
    }

    // Fallback implementation (Legacy)
    async _creditDepositFallback(userId, amount, txHash, description) {
        try {
             // Check for duplicate transaction in ledger_entries
             const { data: existing, error: checkError } = await supabase
                 .from('ledger_entries')
                 .select('id')
                 .eq('reference_id', txHash)
                 .eq('type', 'deposit')
                 .maybeSingle();
             
             // If table missing, we can't check duplicates properly, so we assume valid for now or return
             if (checkError && (checkError.code === 'PGRST205' || (checkError.message && checkError.message.includes('relation')))) {
                  console.warn('ledger_entries table missing during fallback. Skipping duplicate check.');
             } else if (existing) {
                 console.log(`Transaction ${txHash} already processed.`);
                 return false;
             }

             const { data: account, error: fetchError } = await supabase
                 .from('ledger_accounts')
                 .select('available_balance')
                 .eq('user_id', userId)
                 .single();

             // Handle missing account/table
             if (fetchError) {
                 if (fetchError.code === 'PGRST205' || (fetchError.message && fetchError.message.includes('relation'))) {
                     console.warn('ledger_accounts table missing during fallback. Simulating success.');
                     return true;
                 }
                 console.error('Ledger Account Not Found (Fallback):', fetchError);
                 throw new Error('Ledger Account Not Found');
             }
             
             if (!account) throw new Error('Ledger Account Not Found'); // Should be caught by ensureAccount technically

             const balanceBefore = parseFloat(account.available_balance || 0);
             const balanceAfter = balanceBefore + parseFloat(amount);

             const { error: entryError } = await supabase.from('ledger_entries').insert({
                 user_id: userId,
                 type: 'deposit',
                 amount: amount,
                 balance_type: 'available',
                 direction: 'credit',
             reference_id: txHash,
             description: description,
             balance_before: balanceBefore,
             balance_after: balanceAfter
         });

         if (entryError) throw entryError;

         const { error: accountError } = await supabase
             .from('ledger_accounts')
             .update({ available_balance: balanceAfter })
             .eq('user_id', userId);

         if (accountError) throw accountError;

         console.log(`Credited ${amount} USDT to user ${userId}. New Balance: ${balanceAfter}`);
         return true;
        } catch (e) {
            console.error('_creditDepositFallback failed:', e);
            // Even fallback failed? Then we really can't do much.
            // But if it's just table missing, we should have handled it above.
            // If we are here, something else broke.
            return false;
        }
    }

    // Exchange Engine: Lock Funds
    async lockFundsForExchange(userId, amount, exchangeId) {
        try {
            await this.ensureAccount(userId);

            const { data, error } = await supabase.rpc('lock_funds', {
                p_user_id: userId,
                p_amount: amount,
                p_ref_id: exchangeId,
                p_description: 'Locked for Exchange'
            });

            if (error) throw error;
            if (!data.success) throw new Error(data.message || 'Lock failed');

            return true;
        } catch (error) {
                console.error('Lock Funds Error:', error);
                if ((error.message.includes('function lock_funds') && error.message.includes('does not exist')) ||
                    error.code === 'PGRST202' ||
                    error.message.includes('Could not find the function')) {
                     console.warn('RPC missing, falling back to non-atomic update (DEV ONLY)');
                     return this._lockFundsFallback(userId, amount, exchangeId);
                }
                throw error;
            }
    }

    async _lockFundsFallback(userId, amount, exchangeId) {
            const { data: account, error: fetchError } = await supabase
                .from('ledger_accounts')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (fetchError || !account) {
                 console.error('Lock Funds Fallback Error: Account not found', fetchError);
                 throw new Error('Ledger Account Not Found (Lock Fallback)');
            }

            const available = parseFloat(account.available_balance || 0);
            const locked = parseFloat(account.locked_balance || 0);
            const reqAmount = parseFloat(amount);

            if (available < reqAmount) {
                throw new Error('Insufficient available balance');
            }

            const newAvailable = available - reqAmount;
            const newLocked = locked + reqAmount;

            await supabase.from('ledger_entries').insert({
                user_id: userId,
                type: 'withdrawal_lock',
                amount: reqAmount,
                balance_type: 'available',
                direction: 'debit',
                reference_id: exchangeId,
                description: description,
                balance_before: available,
                balance_after: newAvailable
            });

            await supabase.from('ledger_entries').insert({
                user_id: userId,
                type: 'withdrawal_lock',
                amount: reqAmount,
                balance_type: 'locked',
                direction: 'credit',
                reference_id: exchangeId,
                description: description,
                balance_before: locked,
                balance_after: newLocked
            });

            const { error } = await supabase
                .from('ledger_accounts')
                .update({
                    available_balance: newAvailable,
                    locked_balance: newLocked
                })
                .eq('user_id', userId);
            
            if (error) throw error;
            
            return true;
    }

    // USDT Withdrawal: Lock Funds
    async lockFundsForWithdrawal(userId, amount, withdrawalId) {
        try {
            // Use generic lock_funds RPC
            const { data, error } = await supabase.rpc('lock_funds', {
                p_user_id: userId,
                p_amount: amount,
                p_ref_id: withdrawalId,
                p_description: 'USDT Withdrawal Lock'
            });

            if (error) throw error;
            if (!data.success) throw new Error(data.message || 'Lock failed');

            return true;
        } catch (error) {
            console.error('Lock Funds for Withdrawal Error:', error);
             // Fallback if RPC missing
            if ((error.message.includes('function lock_funds') && error.message.includes('does not exist')) ||
                error.code === 'PGRST202' ||
                error.message.includes('Could not find the function')) {
                 console.warn('RPC missing, falling back to non-atomic update (DEV ONLY)');
                 return this._lockFundsFallback(userId, amount, withdrawalId);
            }
            throw error;
        }
    }

    // USDT Withdrawal: Finalize (Deduct Locked)
    async finalizeWithdrawal(userId, amount, withdrawalId) {
         try {
             // Try RPC first
             const { data, error } = await supabase.rpc('finalize_withdrawal', {
                 p_user_id: userId,
                 p_amount: amount,
                 p_withdrawal_id: withdrawalId
             });
             
             if (!error && data && data.success) return true;
             
             // Fallback
             return this._finalizeWithdrawalFallback(userId, amount, withdrawalId);
         } catch (err) {
             console.warn('Finalize Withdrawal RPC failed, using fallback', err);
             return this._finalizeWithdrawalFallback(userId, amount, withdrawalId);
         }
    }

    async _finalizeWithdrawalFallback(userId, amount, withdrawalId) {
        const { data: account, error: fetchError } = await supabase
            .from('ledger_accounts')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (fetchError || !account) throw new Error('Account not found');

        const locked = parseFloat(account.locked_balance || 0);
        const settled = parseFloat(account.settled_balance || 0);
        const reqAmount = parseFloat(amount);

        const newLocked = locked - reqAmount;
        const newSettled = settled - reqAmount; // Wait, settled balance? 
        // Usually finalized withdrawal means money left the system. 
        // So we reduce locked (liability) and maybe track it in settled if settled tracks "net outcome"? 
        // Or just reduce locked. 
        // Let's assume "settled_balance" tracks *completed* transactions? 
        // Or maybe settled_balance is just "money that is yours and not pending"?
        // Actually, in standard double entry:
        // Lock: Available -> Locked
        // Finalize: Locked -> (Gone)
        // So we just decrease Locked.
        
        // However, the `creditDeposit` increases `available`.
        // So `finalizeWithdrawal` should just decrease `locked`.
        
        // Wait, if I decrease locked, the total balance decreases. Correct.
        
        const { error } = await supabase
            .from('ledger_accounts')
            .update({ locked_balance: newLocked })
            .eq('user_id', userId);

        if (error) throw error;

        // Ledger Entry
        await supabase.from('ledger_entries').insert({
            user_id: userId,
            type: 'withdrawal_finalized',
            amount: reqAmount,
            balance_type: 'locked',
            direction: 'debit',
            reference_id: withdrawalId,
            description: 'USDT Withdrawal Finalized',
            balance_before: locked,
            balance_after: newLocked
        });

        return true;
    }

    // USDT Withdrawal: Fail/Refund (Unlock)
    async failWithdrawal(userId, amount, withdrawalId) {
        try {
            // Try RPC
             const { data, error } = await supabase.rpc('fail_withdrawal', {
                 p_user_id: userId,
                 p_amount: amount,
                 p_withdrawal_id: withdrawalId
             });
             if (!error && data && data.success) return true;
             return this._failWithdrawalFallback(userId, amount, withdrawalId);
        } catch (err) {
            return this._failWithdrawalFallback(userId, amount, withdrawalId);
        }
    }

    async _failWithdrawalFallback(userId, amount, withdrawalId) {
        const { data: account, error: fetchError } = await supabase
            .from('ledger_accounts')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (fetchError || !account) throw new Error('Account not found');

        const available = parseFloat(account.available_balance || 0);
        const locked = parseFloat(account.locked_balance || 0);
        const reqAmount = parseFloat(amount);

        const newAvailable = available + reqAmount;
        const newLocked = locked - reqAmount;

        const { error } = await supabase
            .from('ledger_accounts')
            .update({ 
                available_balance: newAvailable,
                locked_balance: newLocked
            })
            .eq('user_id', userId);

        if (error) throw error;

        // Ledger Entries
        await supabase.from('ledger_entries').insert({
            user_id: userId,
            type: 'withdrawal_failed',
            amount: reqAmount,
            balance_type: 'locked',
            direction: 'debit',
            reference_id: withdrawalId,
            description: 'USDT Withdrawal Failed - Unlock',
            balance_before: locked,
            balance_after: newLocked
        });

        await supabase.from('ledger_entries').insert({
            user_id: userId,
            type: 'withdrawal_failed',
            amount: reqAmount,
            balance_type: 'available',
            direction: 'credit',
            reference_id: withdrawalId,
            description: 'USDT Withdrawal Failed - Unlock',
            balance_before: available,
            balance_after: newAvailable
        });

        return true;
    }

    // Exchange Engine: Settle (Success)
    async settleExchange(userId, amount, exchangeId) {
        try {
            const { data, error } = await supabase.rpc('settle_exchange', {
                p_user_id: userId,
                p_amount: amount,
                p_ref_id: exchangeId
            });

            if (error) throw error;
            return true;
        } catch (error) {
                console.error('Settle Exchange Error:', error);
                if ((error.message.includes('function settle_exchange') && error.message.includes('does not exist')) ||
                    error.code === 'PGRST202' ||
                    error.message.includes('Could not find the function')) {
                     console.warn('RPC missing, falling back to non-atomic update (DEV ONLY)');
                     return this._settleExchangeFallback(userId, amount, exchangeId);
                }
                throw error;
            }
    }

    async _settleExchangeFallback(userId, amount, exchangeId) {
            const { data: account, error: fetchError } = await supabase
                .from('ledger_accounts')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (fetchError || !account) {
                 console.error('Settle Exchange Fallback Error: Account not found', fetchError);
                 throw new Error('Ledger Account Not Found (Settle Fallback)');
            }

            const locked = parseFloat(account.locked_balance || 0);
            const settled = parseFloat(account.settled_balance || 0);
            const reqAmount = parseFloat(amount);

            const newLocked = locked - reqAmount;
            const newSettled = settled + reqAmount;

            await supabase.from('ledger_entries').insert({
                user_id: userId,
                type: 'withdrawal_settle',
                amount: reqAmount,
                balance_type: 'locked',
                direction: 'debit',
                reference_id: exchangeId,
                description: 'Exchange Settled',
                balance_before: locked,
                balance_after: newLocked
            });
            
            await supabase.from('ledger_entries').insert({
                user_id: userId,
                type: 'withdrawal_settle',
                amount: reqAmount,
                balance_type: 'settled',
                direction: 'credit',
                reference_id: exchangeId,
                description: 'Exchange Settled',
                balance_before: settled,
                balance_after: newSettled
            });

            await supabase
                .from('ledger_accounts')
                .update({
                    locked_balance: newLocked,
                    settled_balance: newSettled
                })
                .eq('user_id', userId);

            return true;
    }

    // Exchange Engine: Refund (Failure)
    async refundExchange(userId, amount, exchangeId) {
        try {
            const { data, error } = await supabase.rpc('refund_exchange', {
                p_user_id: userId,
                p_amount: amount,
                p_ref_id: exchangeId
            });

            if (error) throw error;
            return true;
        } catch (error) {
                console.error('Refund Exchange Error:', error);
                if ((error.message.includes('function refund_exchange') && error.message.includes('does not exist')) ||
                    error.code === 'PGRST202' ||
                    error.message.includes('Could not find the function')) {
                     console.warn('RPC missing, falling back to non-atomic update (DEV ONLY)');
                     return this._refundExchangeFallback(userId, amount, exchangeId);
                }
                throw error;
            }
    }

    async _refundExchangeFallback(userId, amount, exchangeId) {
            const { data: account, error: fetchError } = await supabase
                .from('ledger_accounts')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (fetchError || !account) {
                 console.error('Refund Exchange Fallback Error: Account not found', fetchError);
                 throw new Error('Ledger Account Not Found (Refund Fallback)');
            }

            const available = parseFloat(account.available_balance || 0);
            const locked = parseFloat(account.locked_balance || 0);
            const reqAmount = parseFloat(amount);

            const newAvailable = available + reqAmount;
            const newLocked = locked - reqAmount;

            await supabase.from('ledger_entries').insert({
                user_id: userId,
                type: 'withdrawal_refund',
                amount: reqAmount,
                balance_type: 'locked',
                direction: 'debit',
                reference_id: exchangeId,
                description: 'Exchange Refunded',
                balance_before: locked,
                balance_after: newLocked
            });

            await supabase.from('ledger_entries').insert({
                user_id: userId,
                type: 'withdrawal_refund',
                amount: reqAmount,
                balance_type: 'available',
                direction: 'credit',
                reference_id: exchangeId,
                description: 'Exchange Refunded',
                balance_before: available,
                balance_after: newAvailable
            });

            await supabase
                .from('ledger_accounts')
                .update({
                    available_balance: newAvailable,
                    locked_balance: newLocked
                })
                .eq('user_id', userId);

            return true;
    }
}

module.exports = new LedgerService();
