require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
<<<<<<< HEAD
const TronWeb = require('tronweb');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());
=======
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');

// Middleware
const { authMiddleware, requireKycApproved } = require('./middleware/auth');

// Services
const walletService = require('./services/walletService');
const ledgerService = require('./services/ledgerService');
const tronService = require('./services/tronService');
const exchangeService = require('./services/exchangeService');
const payoutService = require('./services/payoutService');
const kycService = require('./services/kycService');
const auditService = require('./services/auditService');
const complianceService = require('./services/complianceService');
const withdrawalWorker = require('./services/withdrawalWorker');

const app = express();
app.use(cors());
app.use(express.json());
// Middleware to extract IP for audit logging
app.use((req, res, next) => {
    req.clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    next();
});
>>>>>>> ce6f0a8 (Initial commit)

const PORT = process.env.PORT || 3000;

// Supabase Setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

<<<<<<< HEAD
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
=======
// Initialize Services
(async () => {
    try {
        console.log('Initializing Services...');
        await walletService.initializeWallets();
        tronService.startListener();
        payoutService.startWorker();
        withdrawalWorker.start();
        console.log('Services Initialized.');
    } catch (error) {
        console.error('Error initializing services:', error);
    }
})();
>>>>>>> ce6f0a8 (Initial commit)

// --- API Endpoints ---

app.get('/', (req, res) => {
<<<<<<< HEAD
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

=======
    res.send('Offramp USDT Server is running. Please use the frontend application.');
});

// --- Auth Mock Endpoint ---
app.get('/api/auth/me', authMiddleware, (req, res) => {
    // Returns the user profile enriched with mock data from middleware
    res.json(req.user);
});

// --- Exchange & Payout System ---

app.get('/api/exchange/rate', async (req, res) => {
    try {
        const rate = await exchangeService.getLiveRate();
        res.json({ rate });
    } catch (err) {
        if (err.code === 'PGRST205' || err.message?.includes('relation') || err.message?.includes('does not exist')) {
             console.warn('Admin Exchange Orders: Table missing, returning empty list');
             return res.json([]);
        }
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/exchange/create', authMiddleware, requireKycApproved, async (req, res) => {
    const { usdt_amount } = req.body;
    
    if (!usdt_amount || usdt_amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
    }

    try {
        // Compliance Check
        await complianceService.checkExchangeLimit(req.user.id, usdt_amount);

        const result = await exchangeService.createExchangeOrder(req.user.id, usdt_amount);
        
        if (result.success) {
            await auditService.log('user', req.user.id, 'EXCHANGE_CREATE', result.orderId, { usdt_amount, rate: result.rate }, req.clientIp);
            res.json(result);
        } else {
            await auditService.log('user', req.user.id, 'EXCHANGE_FAILED', null, { reason: result.error, usdt_amount }, req.clientIp);
            res.status(400).json(result);
        }
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/exchange/orders', authMiddleware, async (req, res) => {
    try {
        const orders = await exchangeService.getUserOrders(req.user.id);
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Admin Endpoints ---

// Get All Exchange Orders
app.get('/api/admin/exchange/orders', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('exchange_orders')
            .select('*, users(email, account_holder_name)')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        res.json(data);
    } catch (err) {
        if (err.code === 'PGRST205' || err.message?.includes('relation') || err.message?.includes('does not exist')) {
             console.warn('Admin Exchange Orders: Table missing, returning empty list');
             return res.json([]);
        }
        res.status(500).json({ error: err.message });
    }
});

// Get Payout Logs
app.get('/api/admin/exchange/logs/:order_id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('payout_attempts')
            .select('*')
            .eq('exchange_order_id', req.params.order_id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        if (err.code === 'PGRST205' || err.message?.includes('relation') || err.message?.includes('does not exist')) {
             console.warn('Admin Logs: Table missing, returning empty list');
             return res.json([]);
        }
        res.status(500).json({ error: err.message });
    }
});

// Payout Control (Pause/Resume)
app.get('/api/admin/payout/control', (req, res) => {
    res.json({ success: true, paused: payoutService.isPaused });
});

app.post('/api/admin/payout/control', async (req, res) => {
    const { paused } = req.body;
    try {
        payoutService.setPaused(paused);
        await auditService.log('admin', null, 'PAYOUT_CONTROL', null, { paused }, req.clientIp);
        res.json({ success: true, paused: payoutService.isPaused });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Exchange Order Actions (Retry/Refund)
app.post('/api/admin/exchange/action', async (req, res) => {
    const { order_id, action, reason } = req.body;
    
    try {
        if (action === 'retry') {
             const { error } = await supabase
                .from('exchange_orders')
                .update({ status: 'PENDING' })
                .eq('id', order_id);
                
             if (error) throw error;
             await auditService.log('admin', null, 'ORDER_RETRY', order_id, {}, req.clientIp);
             res.json({ success: true });
             
        } else if (action === 'refund' || action === 'cancel') {
             const { error } = await supabase.rpc('refund_exchange_order', {
                 p_order_id: order_id,
                 p_reason: reason || (action === 'cancel' ? 'Admin Cancelled' : 'Admin Manual Refund')
             });
             
             if (error) throw error;
             await auditService.log('admin', null, `ORDER_${action.toUpperCase()}`, order_id, { reason }, req.clientIp);
             res.json({ success: true });
             
        } else {
            res.status(400).json({ error: 'Invalid action' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Wallet & Deposit ---

// Generate Deposit Address
app.post('/api/generate-address', authMiddleware, requireKycApproved, async (req, res) => {
    try {
        if (complianceService.getGlobalSwitches().deposits_paused) {
             return res.status(403).json({ error: 'Deposits are currently paused by admin.' });
        }

        const addressData = await walletService.generateDepositAddress(req.user.id);
        res.json({ success: true, address: addressData });
    } catch (err) {
        console.error("Error generating address:", err);
        res.status(500).json({ error: err.message });
    }
});

// Simulate Deposit
app.post('/api/simulate-deposit', async (req, res) => {
    const { user_id, amount } = req.body;
    
    if (!user_id || !amount) return res.status(400).json({ error: 'Missing parameters' });

    try {
        const txHash = uuidv4(); 
        const success = await ledgerService.creditDeposit(user_id, amount, txHash, 'Simulated Deposit');
        
        if (!success) return res.status(400).json({ error: 'Deposit failed or already processed' });
        
        // Legacy Transaction Record
        const { data } = await supabase
            .from('transactions')
            .insert({
                user_id, type: 'deposit', amount, tx_hash: txHash, status: 'completed'
            })
            .select().single();

        await auditService.log('system', user_id, 'DEPOSIT_SIMULATED', txHash, { amount }, req.clientIp);
>>>>>>> ce6f0a8 (Initial commit)
        res.json({ success: true, transaction: data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

<<<<<<< HEAD
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
=======
// Admin: Simulate TRON Tx
app.post('/api/admin/simulate-tron-tx', async (req, res) => {
    const { user_id, amount, tx_hash } = req.body;
    if (!user_id || !amount || !tx_hash) return res.status(400).json({ error: 'Missing parameters' });

    try {
        const { data: addrData, error } = await supabase
            .from('deposit_addresses')
            .select('*')
            .eq('user_id', user_id).eq('is_used', false)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();

        if (error || !addrData) return res.status(400).json({ error: 'No active deposit address found.' });

        const fakeTx = {
            transaction_id: tx_hash,
            value: amount * 1000000,
            token_info: { symbol: 'USDT' },
            block_timestamp: Date.now(),
            from: 'T_FAKE_SENDER_ADDRESS',
            to: addrData.tron_address
        };

        await tronService.processTransaction(fakeTx, addrData);
        await auditService.log('admin', user_id, 'TRON_TX_SIMULATED', tx_hash, { amount }, req.clientIp);

        res.json({ success: true, message: 'Transaction simulation triggered.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Public Config ---
app.get('/api/config/public', (req, res) => {
    res.json({
        usdt_withdrawals_paused: complianceService.getGlobalSwitches().usdt_withdrawals_paused,
        limits: complianceService.getLimits(),
        min_withdrawal: 20.0,
        fee: 5.0
    });
});

// --- Compliance Limits ---
app.get('/api/compliance/limits', authMiddleware, async (req, res) => {
    try {
        const limits = complianceService.getLimits();
        res.json({ limits });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Withdrawals ---

// USDT Withdrawal Request
app.post('/api/withdraw/usdt', authMiddleware, requireKycApproved, async (req, res) => {
    const { destination_address, amount } = req.body;
    const idempotencyKey = req.headers['idempotency-key'];
    const userId = req.user.id;
    const fee = 5.0; // Flat fee as per requirement
    const minWithdrawal = 20.0;

    if (!destination_address || !amount || amount < minWithdrawal) {
        return res.status(400).json({ error: `Minimum withdrawal is ${minWithdrawal} USDT` });
    }

    // Idempotency Check
    if (idempotencyKey) {
        // Check Mock Store
        const existingMock = usdtWithdrawalsStore.find(w => w.id === idempotencyKey);
        if (existingMock) {
             return res.json({ success: true, message: 'Request already processed (Idempotent)', withdrawal: existingMock });
        }
        
        // Check DB
        const { data: dbExisting, error: dbCheckError } = await supabase
            .from('usdt_withdrawals')
            .select('*')
            .eq('id', idempotencyKey)
            .maybeSingle();

        if (dbExisting) {
            return res.json({ success: true, message: 'Request already processed (Idempotent)', withdrawal: dbExisting });
        }
    }

    try {
        // 1. Compliance Check (Global Switch)
        await complianceService.checkUSDTWithdrawalLimit(userId, amount);

        // 2. Check for pending withdrawals (one at a time per user)
        const { data: pending } = await supabase
            .from('usdt_withdrawals')
            .select('id')
            .eq('user_id', userId)
            .eq('status', 'pending')
            .maybeSingle();

        if (pending) {
            return res.status(400).json({ error: 'You already have a pending withdrawal.' });
        }

        const totalNeeded = parseFloat(amount) + fee;

        // 3. Create Withdrawal Record (Status: pending)
        const withdrawalData = {
            user_id: userId,
            destination_address,
            usdt_amount: amount,
            fee: fee,
            net_amount: amount - fee, 
            status: 'pending'
        };
        if (idempotencyKey) withdrawalData.id = idempotencyKey;

        const { data: withdrawal, error: wError } = await supabase
            .from('usdt_withdrawals')
            .insert(withdrawalData)
            .select().single();

        let finalWithdrawal = withdrawal;

        if (wError) {
             if (wError.code === 'PGRST205' || wError.message?.includes('relation') || wError.message?.includes('does not exist')) {
                 console.warn('USDT Withdrawal Table missing, using in-memory store');
                 const newWithdrawal = {
                     id: idempotencyKey || uuidv4(),
                     user_id: userId,
                     destination_address,
                     usdt_amount: amount,
                     fee: fee,
                     net_amount: amount - fee,
                     status: 'pending',
                     created_at: new Date().toISOString(),
                     updated_at: new Date().toISOString()
                 };
                 usdtWithdrawalsStore.push(newWithdrawal);
                 finalWithdrawal = newWithdrawal;
             } else {
                 throw wError;
             }
        }

        // 4. Lock Funds in Ledger
        try {
            await ledgerService.lockFundsForWithdrawal(userId, totalNeeded, finalWithdrawal.id);
        } catch (lockError) {
            // Update withdrawal status to failed if lock fails
            if (finalWithdrawal.id) {
                if (usdtWithdrawalsStore.find(w => w.id === finalWithdrawal.id)) {
                     const w = usdtWithdrawalsStore.find(w => w.id === finalWithdrawal.id);
                     w.status = 'failed';
                     w.failure_reason = lockError.message;
                } else {
                    await supabase.from('usdt_withdrawals').update({ 
                        status: 'failed', 
                        failure_reason: lockError.message 
                    }).eq('id', finalWithdrawal.id);
                }
            }
            
            return res.status(400).json({ error: 'Insufficient balance: ' + lockError.message });
        }

        await auditService.log('user', userId, 'USDT_WITHDRAW_REQUESTED', finalWithdrawal.id, { amount, fee, totalNeeded }, req.clientIp);

        res.json({ success: true, withdrawal_id: finalWithdrawal.id });

    } catch (err) {
        console.error('Withdraw USDT Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get User USDT Withdrawals
app.get('/api/withdrawals/usdt', authMiddleware, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('usdt_withdrawals')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (error) {
             if (error.code === 'PGRST205' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
                 const userWithdrawals = usdtWithdrawalsStore.filter(w => w.user_id === req.user.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                 return res.json(userWithdrawals);
             }
             throw error;
        }
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/withdraw', authMiddleware, requireKycApproved, async (req, res) => {
    const { amount, bank_account_number, ifsc_code } = req.body;
    const user_id = req.user.id;

    try {
        await complianceService.checkWithdrawalLimit(user_id, amount);

        const { data: withdrawal, error: wError } = await supabase
            .from('withdrawals')
            .insert({ user_id, amount, bank_account_number, ifsc_code, status: 'pending' })
            .select().single();

        if (wError) throw wError;

        try {
            await ledgerService.lockFundsForExchange(user_id, amount, withdrawal.id);
        } catch (lockError) {
            await supabase.from('withdrawals').update({ status: 'failed', failure_reason: lockError.message }).eq('id', withdrawal.id);
            return res.status(400).json({ error: 'Transaction failed: ' + lockError.message });
        }

        await auditService.log('user', user_id, 'WITHDRAWAL_REQUEST', withdrawal.id, { amount }, req.clientIp);
        res.json({ success: true, withdrawal });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/withdrawals', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('withdrawals').select('*, users(account_holder_name)').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        if (err.code === 'PGRST205' || err.message?.includes('relation')) return res.json([]);
        res.status(500).json({ error: err.message });
    }
});

// Admin: USDT Withdrawals List
app.get('/api/admin/withdrawals/usdt', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('usdt_withdrawals')
            .select('*, users(account_holder_name, email)')
            .order('created_at', { ascending: false });

        if (error) {
             if (error.code === 'PGRST205' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
                 // Enrich with mock user data if possible, or just return basic
                 // Since we don't have user list in memory easily, we return raw
                 // In real app, we'd join with users, but here we just return store
                 const allWithdrawals = [...usdtWithdrawalsStore].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                 return res.json(allWithdrawals);
             }
             throw error;
        }
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: USDT Withdrawal Retry
app.post('/api/admin/withdrawals/usdt/retry', async (req, res) => {
    const { id } = req.body;
    try {
        // Only allow retry if status is failed
        let w = null;
        const { data: dbW, error: dbError } = await supabase
            .from('usdt_withdrawals')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (dbError && (dbError.code === 'PGRST205' || dbError.message?.includes('relation') || dbError.message?.includes('does not exist'))) {
            w = usdtWithdrawalsStore.find(x => x.id === id);
        } else {
            w = dbW;
        }
            
        if (!w) return res.status(404).json({ error: 'Withdrawal not found' });
        if (w.status !== 'failed') return res.status(400).json({ error: 'Only failed withdrawals can be retried' });

        // Lock funds again (since they were unlocked on failure)
        const totalNeeded = parseFloat(w.usdt_amount) + parseFloat(w.fee);
        
        // Check balance first? 
        // We need to re-lock. 
        // Logic: 
        // 1. Check if user has enough available balance (since it was refunded)
        // 2. Lock it
        // 3. Set status to pending (Worker will pick it up)

        try {
            await ledgerService.lockFundsForWithdrawal(w.user_id, totalNeeded, w.id);
        } catch (lockError) {
            return res.status(400).json({ error: 'Cannot retry: Insufficient balance or lock error' });
        }

        // Update status to pending
        if (usdtWithdrawalsStore.find(x => x.id === id)) {
            const mockW = usdtWithdrawalsStore.find(x => x.id === id);
            mockW.status = 'pending';
            mockW.failure_reason = null;
            mockW.updated_at = new Date().toISOString();
        } else {
            const { error } = await supabase
                .from('usdt_withdrawals')
                .update({ status: 'pending', failure_reason: null, updated_at: new Date().toISOString() })
                .eq('id', id);
            if (error) throw error;
        }

        await auditService.log('admin', null, 'USDT_WITHDRAW_RETRY', id, {}, req.clientIp);
        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: USDT Withdrawal Cancel/Refund
app.post('/api/admin/withdrawals/usdt/cancel', async (req, res) => {
    const { id, reason } = req.body;
    try {
        let w = null;
        const { data: dbW, error: dbError } = await supabase
            .from('usdt_withdrawals')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (dbError && (dbError.code === 'PGRST205' || dbError.message?.includes('relation') || dbError.message?.includes('does not exist'))) {
            w = usdtWithdrawalsStore.find(x => x.id === id);
        } else {
            w = dbW;
        }

        if (!w) return res.status(404).json({ error: 'Withdrawal not found' });
        
        // Cancel is essentially failing it manually and refunding
        if (w.status === 'completed') return res.status(400).json({ error: 'Cannot cancel completed withdrawal' });
        if (w.status === 'failed') return res.status(400).json({ error: 'Already failed/cancelled' });

        // Update status to failed
        if (usdtWithdrawalsStore.find(x => x.id === id)) {
            const mockW = usdtWithdrawalsStore.find(x => x.id === id);
            mockW.status = 'failed';
            mockW.failure_reason = reason || 'Admin Cancelled';
            mockW.updated_at = new Date().toISOString();
        } else {
            const { error } = await supabase
                .from('usdt_withdrawals')
                .update({ status: 'failed', failure_reason: reason || 'Admin Cancelled', updated_at: new Date().toISOString() })
                .eq('id', id);
            if (error) throw error;
        }

        // Refund funds
        const totalToRefund = parseFloat(w.usdt_amount) + parseFloat(w.fee);
        await ledgerService.failWithdrawal(w.user_id, totalToRefund, w.id);

        await auditService.log('admin', null, 'USDT_WITHDRAW_CANCELLED', id, { reason }, req.clientIp);
        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: USDT Manual Refund (Force Refund)
app.post('/api/admin/withdrawals/usdt/refund', async (req, res) => {
    const { id, reason } = req.body;
    try {
        let w = null;
        const { data: dbW, error: dbError } = await supabase
            .from('usdt_withdrawals')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (dbError && (dbError.code === 'PGRST205' || dbError.message?.includes('relation') || dbError.message?.includes('does not exist'))) {
            w = usdtWithdrawalsStore.find(x => x.id === id);
        } else {
            w = dbW;
        }

        if (!w) return res.status(404).json({ error: 'Withdrawal not found' });

        // Force refund allows refunding even if status is failed (in case it failed but didn't refund)
        // Or if it's stuck.
        
        // Execute Refund Logic
        const totalToRefund = parseFloat(w.usdt_amount) + parseFloat(w.fee);
        
        // Note: ledgerService.failWithdrawal handles logic. If it was already refunded (locked balance 0), it might not do anything or might just ensure consistency.
        // We should check if we want to update status.
        
        if (usdtWithdrawalsStore.find(x => x.id === id)) {
            const mockW = usdtWithdrawalsStore.find(x => x.id === id);
            mockW.status = 'failed'; // Ensure it is marked failed
            mockW.failure_reason = reason || 'Admin Manual Refund';
            mockW.updated_at = new Date().toISOString();
        } else {
             await supabase
                .from('usdt_withdrawals')
                .update({ status: 'failed', failure_reason: reason || 'Admin Manual Refund', updated_at: new Date().toISOString() })
                .eq('id', id);
        }

        await ledgerService.failWithdrawal(w.user_id, totalToRefund, w.id);
        
        await auditService.log('admin', null, 'USDT_WITHDRAW_FORCE_REFUND', id, { reason }, req.clientIp);
        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: USDT Control (Pause/Resume)
app.get('/api/admin/withdrawals/usdt/control', (req, res) => {
    res.json({ success: true, paused: complianceService.getGlobalSwitches().usdt_withdrawals_paused });
});

app.post('/api/admin/withdrawals/usdt/control', async (req, res) => {
    const { paused } = req.body;
    try {
        complianceService.setGlobalSwitch('usdt_withdrawals_paused', paused);
        await auditService.log('admin', null, 'USDT_WITHDRAW_CONTROL', null, { paused }, req.clientIp);
        res.json({ success: true, paused: complianceService.getGlobalSwitches().usdt_withdrawals_paused });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



// Admin: Deposits
app.get('/api/admin/deposits', async (req, res) => {
    try {
        const { status } = req.query;
        let query = supabase.from('blockchain_transactions').select('*, users(email, account_holder_name)').order('created_at', { ascending: false });
        if (status) query = query.eq('status', status);
        const { data, error } = await query;
        if (error) throw error;
        res.json(data);
    } catch (err) {
        if (err.code === 'PGRST205' || err.message?.includes('relation')) return res.json([]);
        res.status(500).json({ error: err.message });
    }
});

// Admin: Process Late Deposit
app.post('/api/admin/process-late-deposit', async (req, res) => {
    const { tx_hash } = req.body;
    try {
        const { data: tx, error } = await supabase.from('blockchain_transactions').select('*').eq('tx_hash', tx_hash).single();
        if (error || !tx) return res.status(404).json({ error: 'Transaction not found' });

        if (tx.status !== 'late_deposit' && tx.status !== 'detected') return res.status(400).json({ error: `Invalid status: ${tx.status}` });

        const success = await ledgerService.creditDeposit(tx.user_id, tx.amount, tx_hash, `Manual Credit: ${tx.amount} USDT`);
        if (success) {
            await supabase.from('blockchain_transactions').update({ status: 'credited_manual', processed_at: new Date().toISOString() }).eq('tx_hash', tx_hash);
            await auditService.log('admin', null, 'LATE_DEPOSIT_CREDIT', tx_hash, { amount: tx.amount }, req.clientIp);
            res.json({ success: true, message: 'Deposit credited manually' });
        } else {
            res.status(500).json({ error: 'Ledger credit failed' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Withdrawal Action
app.post('/api/admin/withdrawal-action', async (req, res) => {
    const { withdrawal_id, action } = req.body;
    if (!['approve', 'complete', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid action' });

    try {
        let result;
        if (action === 'approve') {
            const { data, error } = await supabase.from('withdrawals').update({ status: 'processing' }).eq('id', withdrawal_id).select().single();
            if (error) throw error;
            result = data;
        } else if (action === 'complete') {
            const { data: w } = await supabase.from('withdrawals').select('*').eq('id', withdrawal_id).single();
            if (w) await ledgerService.settleExchange(w.user_id, w.amount, withdrawal_id);
            const { data, error } = await supabase.from('withdrawals').update({ status: 'completed' }).eq('id', withdrawal_id).select().single();
            if (error) throw error;
            result = data;
        } else {
            const { data: w } = await supabase.from('withdrawals').select('*').eq('id', withdrawal_id).single();
            if (w) await ledgerService.refundExchange(w.user_id, w.amount, withdrawal_id);
            const { data, error } = await supabase.from('withdrawals').update({ status: 'failed' }).eq('id', withdrawal_id).select().single();
            if (error) throw error;
            result = data;
        }
        await auditService.log('admin', null, `WITHDRAWAL_${action.toUpperCase()}`, withdrawal_id, {}, req.clientIp);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- KYC & Compliance ---

// Admin: Get KYC Requests
app.get('/api/admin/kyc-requests', async (req, res) => {
    try {
        // Prefer kyc_records if available for detailed history
        const { data, error } = await supabase
            .from('kyc_records')
            .select('*')
            .order('submitted_at', { ascending: false });
            
        if (error) {
             // Fallback to users table if kyc_records missing
             const { data: usersData, error: usersError } = await supabase
                .from('users')
                .select('id, account_holder_name, account_number, kyc_status, created_at')
                .not('kyc_status', 'is', null)
                .order('updated_at', { ascending: false });
                
             if (usersError) throw usersError;
             return res.json(usersData);
        }
        res.json(data);
    } catch (err) {
        if (err.code === 'PGRST205' || err.message?.includes('relation')) return res.json([]);
        res.status(500).json({ error: err.message });
    }
});

// Admin: KYC Action
app.post('/api/admin/kyc-action', async (req, res) => {
    const { user_id, action, reason } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid action' });

    try {
        const status = action === 'approve' ? 'approved' : 'rejected';
        
        // Update User
        await supabase.from('users').update({ 
            kyc_status: status,
            kyc_verified_at: action === 'approve' ? new Date() : null,
            kyc_rejection_reason: reason
        }).eq('id', user_id);

        // Update KYC Record if exists
        await supabase.from('kyc_records')
            .update({ status: status, verified_at: new Date(), rejection_reason: reason })
            .eq('user_id', user_id)
            .eq('status', 'pending');

        await auditService.log('admin', null, `KYC_${action.toUpperCase()}`, user_id, { reason }, req.clientIp);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Audit Logs
app.get('/api/admin/audit-logs', async (req, res) => {
    try {
        const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
        if (error) throw error;
        res.json(data);
    } catch (err) {
        if (err.code === 'PGRST205' || err.message?.includes('relation')) return res.json([]);
        res.status(500).json({ error: err.message });
    }
});



// User: Submit KYC
app.post('/api/verify-kyc', authMiddleware, async (req, res) => {
    const { aadhaar_number, full_name, dob } = req.body;
    const user_id = req.user.id;

    if (!aadhaar_number) return res.status(400).json({ error: 'Missing required fields' });

    try {
        const result = await kycService.submitKyc(user_id, { aadhaar_number, full_name, dob }, req.clientIp);
        res.json(result);
    } catch (err) {
        console.error('KYC Error:', err);
>>>>>>> ce6f0a8 (Initial commit)
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
