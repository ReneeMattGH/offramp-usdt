require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
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

const PORT = process.env.PORT || 3000;

// Supabase Setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Services
(async () => {
    try {
        console.log('Initializing Services...');
        // Initialize wallets if needed (safe check)
        // await walletService.initializeWallets(); 
        tronService.startListener();
        payoutService.startWorker();
        withdrawalWorker.start();
        console.log('Services Initialized.');
    } catch (error) {
        console.error('Error initializing services:', error);
    }
})();

// Global Config (In-Memory for now)
let globalConfig = {
    withdrawals_enabled: true,
    min_usdt_withdrawal: 20.0,
    fee: 5.0,
    daily_limit: 100000.0
};

// --- API Endpoints ---

app.get('/', (req, res) => {
    res.send('Offramp USDT Server is running. Please use the frontend application.');
});

// --- Auth Mock Endpoint ---
app.get('/api/auth/me', authMiddleware, (req, res) => {
    // Returns the user profile enriched with mock data from middleware
    res.json(req.user);
});

// --- Public Config ---
app.get('/api/config/public', (req, res) => {
    res.json({
        usdt_withdrawal_fee: globalConfig.fee,
        min_usdt_withdrawal: globalConfig.min_usdt_withdrawal,
        daily_withdrawal_limit: globalConfig.daily_limit,
        withdrawals_enabled: globalConfig.withdrawals_enabled
    });
});

// Admin: Toggle Withdrawals
app.post('/api/admin/config/toggle-withdrawals', async (req, res) => {
    // Ideally add admin auth middleware here
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'Invalid value' });
    
    globalConfig.withdrawals_enabled = enabled;
    // Log audit
    // Assuming we have user context, if not, we use 'system' or passed admin id
    // For now, let's assume this is called by an admin panel with auth
    // We'll just log as 'system' or 'admin' if we had the ID.
    // Since this endpoint is new and might be called via curl for now, we'll keep it simple.
    console.log(`[CONFIG] Withdrawals enabled set to ${enabled}`);
    res.json({ success: true, enabled: globalConfig.withdrawals_enabled });
});

// --- USDT Withdrawal Endpoints ---

// Create Withdrawal Request
app.post('/api/withdraw/usdt', authMiddleware, requireKycApproved, async (req, res) => {
    const { destination_address, amount } = req.body;
    const userId = req.user.id;

    if (!globalConfig.withdrawals_enabled) {
        return res.status(503).json({ error: 'Withdrawals are currently paused by admin' });
    }

    if (!destination_address || !amount) {
        return res.status(400).json({ error: 'Missing destination address or amount' });
    }

    if (parseFloat(amount) < globalConfig.min_usdt_withdrawal) {
        return res.status(400).json({ error: `Minimum withdrawal amount is ${globalConfig.min_usdt_withdrawal} USDT` });
    }

    try {
        // 0. Check Unique Pending Withdrawal Constraint
        const { data: pendingWithdrawal } = await supabase
            .from('usdt_withdrawals')
            .select('id')
            .eq('user_id', userId)
            .eq('status', 'pending')
            .maybeSingle();
        
        if (pendingWithdrawal) {
            return res.status(400).json({ error: 'You already have a pending withdrawal request.' });
        }

        // 1. Lock Funds (Atomically)
        const withdrawalId = uuidv4();
        // Use ledgerService to lock funds. 
        // Note: We need to pass the withdrawalId to lockFundsForWithdrawal if it supports it, 
        // or create the record first. 
        // Based on previous context, ledgerService.lockFundsForWithdrawal handles the locking.
        
        // We need to create the withdrawal record FIRST in 'pending' state, 
        // but to be safe with funds, we should lock first? 
        // Actually, the standard pattern is: Lock funds -> Create Record -> Return Success.
        
        // However, if we look at the ledgerService signature: lockFundsForWithdrawal(userId, amount, withdrawalId)
        
        const fee = globalConfig.fee;
        const totalAmount = parseFloat(amount) + fee;

        // Attempt to lock funds
        const locked = await ledgerService.lockFundsForWithdrawal(userId, totalAmount, withdrawalId);
        
        if (!locked) {
            return res.status(400).json({ error: 'Insufficient funds or lock failed' });
        }

        // 2. Create Withdrawal Record
        const { data: withdrawal, error } = await supabase
            .from('usdt_withdrawals')
            .insert({
                id: withdrawalId,
                user_id: userId,
                destination_address,
                usdt_amount: amount,
                fee: fee,
                net_amount: amount, // net is what user receives? Or net deducted? Usually amount requested is what they want to receive?
                // Let's assume amount is what they want to withdraw. Fee is on top? Or deducted?
                // Frontend logic: "val + fee > balance". So Fee is ON TOP.
                status: 'pending'
            })
            .select()
            .single();

        if (error) {
            // Rollback lock if insert fails (manual rollback needed since no distributed tx)
            console.error('Failed to insert withdrawal, rolling back lock:', error);
            await ledgerService.failWithdrawal(userId, totalAmount, withdrawalId); 
            throw error;
        }

        // 3. Log Audit
        await auditService.log('user', userId, 'WITHDRAW_USDT_REQUEST', withdrawalId, { amount, fee, destination_address }, req.clientIp);

        res.json({ success: true, withdrawal });

    } catch (err) {
        console.error('Withdrawal Request Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// List Withdrawals
app.get('/api/withdrawals/usdt', authMiddleware, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('usdt_withdrawals')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: List All Withdrawals
app.get('/api/admin/withdrawals/usdt', async (req, res) => {
    try {
        // Check admin (simple check, ideally middleware)
        // For now assuming internal network or additional auth layer handled by gateway/middleware
        
        const { data, error } = await supabase
            .from('usdt_withdrawals')
            .select('*, users(email, account_holder_name)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
         if (err.code === 'PGRST205' || err.message?.includes('relation')) {
             return res.json([]); // Table missing
         }
        res.status(500).json({ error: err.message });
    }
});

// Admin: Withdrawal Actions (Retry/Cancel)
app.post('/api/admin/withdrawals/usdt/action', async (req, res) => {
    const { withdrawal_id, action, reason } = req.body;
    
    try {
        if (action === 'retry') {
            const { error } = await supabase
                .from('usdt_withdrawals')
                .update({ status: 'pending', failure_reason: null }) // Reset to pending for worker to pick up
                .eq('id', withdrawal_id);
            
            if (error) throw error;
            
            // Audit Log
            await auditService.log('admin', 'admin_user', 'WITHDRAWAL_RETRY', withdrawal_id, { reason }, req.clientIp);
            
            res.json({ success: true });

        } else if (action === 'cancel') {
             // 1. Get withdrawal details to know amount
             const { data: w } = await supabase.from('usdt_withdrawals').select('*').eq('id', withdrawal_id).single();
             if (!w) return res.status(404).json({ error: 'Withdrawal not found' });

             if (w.status === 'completed') return res.status(400).json({ error: 'Cannot cancel completed withdrawal' });

             // 2. Refund Funds
             const totalAmount = parseFloat(w.usdt_amount) + parseFloat(w.fee);
             await ledgerService.failWithdrawal(w.user_id, totalAmount, withdrawal_id);

             // 3. Update Status
             const { error } = await supabase
                .from('usdt_withdrawals')
                .update({ status: 'refunded', failure_reason: reason || 'Admin Cancelled' })
                .eq('id', withdrawal_id);
            
             if (error) throw error;
             
             // Audit Log
             await auditService.log('admin', 'admin_user', 'WITHDRAWAL_CANCEL', withdrawal_id, { reason, amount: w.usdt_amount }, req.clientIp);

             res.json({ success: true });
        } else {
            res.status(400).json({ error: 'Invalid action' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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
        res.json({ success: true, transaction: data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

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
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
