require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const TronWeb = require('tronweb');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Supabase Setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// TronWeb Setup
const TRON_FULL_NODE = 'https://api.trongrid.io';
const TRON_SOLIDITY_NODE = 'https://api.trongrid.io';
const TRON_EVENT_SERVER = 'https://api.trongrid.io';

const tronWeb = new TronWeb({
    fullNode: TRON_FULL_NODE,
    solidityNode: TRON_SOLIDITY_NODE,
    eventServer: TRON_EVENT_SERVER,
    privateKey: '01'.repeat(32),
});

if (process.env.TRON_PRO_API_KEY) {
    tronWeb.setHeader({ 'TRON-PRO-API-KEY': process.env.TRON_PRO_API_KEY });
}

const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

// --- Helpers ---

async function addToLedger(userId, amount, type, txHash, description) {
    // Lock or optimistic concurrency would be better here, but for now we fetch-then-insert.
    const { data: lastEntry } = await supabase
        .from('ledger')
        .select('balance_after')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    
    const currentBalance = lastEntry ? parseFloat(lastEntry.balance_after) : 0;
    
    let credit = 0;
    let debit = 0;
    let newBalance = currentBalance;
    const amountFloat = parseFloat(amount);
    
    if (type === 'deposit' || type === 'salary') { // Credit
        credit = amountFloat;
        newBalance += amountFloat;
    } else if (type === 'withdrawal') { // Debit
        debit = amountFloat;
        newBalance -= amountFloat;
    }
    
    const { error } = await supabase
        .from('ledger')
        .insert({
            user_id: userId,
            tx_hash: txHash,
            credit_usdt: credit,
            debit_usdt: debit,
            balance_after: newBalance,
            description: description
        });
        
    if (error) {
        console.error('Error inserting into ledger:', error);
        throw error;
    }
}

// --- Background Jobs ---

// 1. Deposit Monitor
cron.schedule('*/30 * * * * *', async () => {
    // console.log('Running Deposit Monitor...');
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, tron_wallet_address');
        
        if (error) throw error;

        // Load USDT contract
        let contract = null;
        try {
            contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
        } catch(e) {
            console.error("Error loading USDT contract:", e.message);
            return;
        }

        for (const user of users) {
            if (!user.tron_wallet_address) continue;

            try {
                // 1. Get On-Chain Balance
                const balanceRaw = await contract.balanceOf(user.tron_wallet_address).call();
                const balance = tronWeb.toDecimal(balanceRaw) / 1000000;

                // 2. Get Recorded Deposits (Assuming no sweeping, so wallet balance = total deposits)
                const { data: deposits } = await supabase
                    .from('transactions')
                    .select('amount')
                    .eq('user_id', user.id)
                    .eq('type', 'deposit');
                
                const totalRecordedDeposits = deposits ? deposits.reduce((sum, tx) => sum + parseFloat(tx.amount), 0) : 0;

                if (balance > totalRecordedDeposits) {
                    const newDepositAmount = balance - totalRecordedDeposits;
                    
                    if (newDepositAmount < 0.01) continue; // Ignore dust
                    
                    console.log(`New deposit detected for ${user.id}: ${newDepositAmount} USDT`);

                    const txHash = uuidv4(); // Fake hash as we are polling balance, not txs
                    
                    // Update Ledger
                    await addToLedger(user.id, newDepositAmount, 'deposit', txHash, 'Detected Deposit');
                    
                    // Record Transaction
                    await supabase.from('transactions').insert({
                        user_id: user.id,
                        type: 'deposit',
                        amount: newDepositAmount,
                        status: 'completed',
                        tx_hash: txHash,
                        created_at: new Date(),
                        updated_at: new Date()
                    });
                }
            } catch (err) {
                // console.error(`Error checking balance for user ${user.id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('Deposit Monitor Error:', err.message);
    }
});

// 2. Payout Processor
cron.schedule('*/10 * * * * *', async () => { // Check every 10 seconds
    // console.log('Running Payout Processor...');
    try {
        const { data: withdrawals, error } = await supabase
            .from('withdrawals')
            .select('*, users(account_holder_name)')
            .eq('status', 'pending');

        if (error) throw error;

        for (const withdrawal of withdrawals) {
            console.log(`Processing withdrawal ${withdrawal.id} for ${withdrawal.amount} to ${withdrawal.bank_account_number}`);

            // Simulate Bank API Call
            const success = await processBankPayout(withdrawal);

            if (success) {
                // 1. Update withdrawal status
                await supabase
                    .from('withdrawals')
                    .update({ status: 'completed', updated_at: new Date() })
                    .eq('id', withdrawal.id);

                // 2. Update Ledger (Debit User)
                // Check if ledger entry already exists (e.g. created by frontend)
                const { data: existingLedger } = await supabase
                    .from('ledger')
                    .select('id')
                    .eq('tx_hash', withdrawal.id)
                    .maybeSingle();

                if (!existingLedger) {
                     await addToLedger(
                        withdrawal.user_id,
                        withdrawal.amount,
                        'withdrawal',
                        withdrawal.id, 
                        `Withdrawal to ${withdrawal.bank_account_number}`
                    );
                }

                // 3. Record/Update in transactions (for history view)
                await supabase.from('transactions').insert({
                    user_id: withdrawal.user_id,
                    type: 'withdrawal',
                    amount: withdrawal.amount,
                    status: 'completed',
                    tx_hash: withdrawal.id,
                    created_at: new Date(),
                    updated_at: new Date()
                });
                
                console.log(`Withdrawal ${withdrawal.id} completed.`);
            } else {
                 await supabase
                    .from('withdrawals')
                    .update({ status: 'failed', updated_at: new Date() })
                    .eq('id', withdrawal.id);
                
                // Check if ledger deduction happened, if so, Refund.
                const { data: existingLedger } = await supabase
                    .from('ledger')
                    .select('id')
                    .eq('tx_hash', withdrawal.id)
                    .maybeSingle();

                if (existingLedger) {
                    await addToLedger(
                        withdrawal.user_id,
                        withdrawal.amount,
                        'deposit', // Credit back
                        uuidv4(), // New hash for refund
                        `Refund for failed withdrawal ${withdrawal.id}`
                    );
                }

                console.log(`Withdrawal ${withdrawal.id} failed.`);
            }
        }
    } catch (err) {
        console.error('Payout Processor Error:', err.message);
    }
});

async function processBankPayout(withdrawal) {
    // Simulate integration with Indian Bank Payout API
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(true); // Always succeed for demo
        }, 2000);
    });
}

// --- API Endpoints ---

app.get('/', (req, res) => {
    res.send('Swift Salary Backend is running');
});

// Endpoint to simulate a deposit (since we can't easily deposit real USDT on testnet without faucet)
app.post('/api/simulate-deposit', async (req, res) => {
    const { user_id, amount } = req.body;
    
    if (!user_id || !amount) {
        return res.status(400).json({ error: 'Missing user_id or amount' });
    }

    try {
        const txHash = uuidv4(); // Generate a fake hash
        
        // 1. Update Ledger
        await addToLedger(user_id, amount, 'deposit', txHash, 'Simulated Deposit');
        
        // 2. Record in Transactions
        const { data, error } = await supabase
            .from('transactions')
            .insert({
                user_id,
                type: 'deposit',
                amount,
                tx_hash: txHash,
                status: 'completed'
            })
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, transaction: data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Endpoint to create a withdrawal request
app.post('/api/withdraw', async (req, res) => {
    const { user_id, amount, bank_account_number, ifsc_code } = req.body;

    try {
        // 1. Check User Balance
        const { data: balanceData, error: balanceError } = await supabase.rpc(
            'get_user_balance',
            { p_user_id: user_id }
        );
        
        if (balanceError) throw balanceError;
        
        const currentBalance = parseFloat(balanceData || 0);
        
        if (currentBalance < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        // 2. Create Withdrawal Request
        const { data: withdrawal, error: wError } = await supabase
            .from('withdrawals')
            .insert({
                user_id,
                amount,
                bank_account_number,
                ifsc_code,
                status: 'pending'
            })
            .select()
            .single();

        if (wError) throw wError;

        res.json({ success: true, withdrawal });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
