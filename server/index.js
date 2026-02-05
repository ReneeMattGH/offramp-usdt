require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const { kycStatusStore, sessionStore } = require('./utils/mockStore');

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
const configService = require('./services/configService');

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

// Safe Supabase Initialization
let supabase;
if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
} else {
    console.warn('Server: Supabase credentials missing. Using mock fallback.');
    supabase = {
        from: () => ({
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: null, error: null }) }), order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
            insert: async () => ({ data: {}, error: null, select: () => ({ single: async () => ({ data: {}, error: null }) }) }),
            update: () => ({ eq: async () => ({ error: null }) }),
            rpc: async () => ({ error: null })
        })
    };
}

// Initialize Services
(async () => {
    try {
        console.log('Initializing Services...');
        // Initialize wallets if needed (safe check)
        // await walletService.initializeWallets(); 
        tronService.startListener();
        payoutService.startWorker();
        withdrawalWorker.start();
        await configService.loadConfig();
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

    // --- Guest Login (Auto-Auth) ---
    app.post('/api/auth/guest-login', async (req, res) => {
        try {
            const accountNumber = 'DEMO_USER_001';
            
            // 1. Check if user exists
            let { data: user, error } = await supabase
                .from('users')
                .select('*')
                .eq('account_number', accountNumber)
                .maybeSingle();
    
            if (error) {
                console.error('Guest Login: Error checking user:', error.message);
                // Fallback: Create mock user if DB fails (Resiliency)
                if (error.code === 'PGRST205' || error.message?.includes('relation')) {
                    console.warn('Users table missing. Using Mock User.');
                    user = {
                        id: 'mock-user-id',
                        account_number: 'DEMO_USER_001',
                        account_holder_name: 'Demo User',
                        kyc_status: 'approved'
                    };
                } else {
                     throw error;
                }
            }
    
            // 2. Create if not exists
            if (!user) {
                const walletAddress = await walletService.generateWallet(); 
                
                // Try full insert first
                try {
                    const { data: newUser, error: createError } = await supabase
                        .from('users')
                        .insert({
                            account_holder_name: 'Demo User',
                            account_number: accountNumber,
                            ifsc_code: 'DEMO0000001',
                            tron_wallet_address: walletAddress.address,
                            encrypted_private_key: walletAddress.privateKey,
                            kyc_status: 'approved' 
                        })
                        .select()
                        .single();
                    
                    if (createError) throw createError;
                    user = newUser;
                } catch (insertError) {
                    console.error('Guest Login: Failed to create user, using partial mock', insertError);
                     user = {
                        id: 'mock-user-id',
                        account_number: 'DEMO_USER_001',
                        account_holder_name: 'Demo User',
                        kyc_status: 'approved'
                    };
                }
            }
    
            // 3. Create Session
            const token = uuidv4();
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
    
            try {
                 const { error: sessionError } = await supabase
                     .from('sessions')
                     .insert({
                         user_id: user.id,
                         token,
                         expires_at: expiresAt
                     });
         
                 if (sessionError) {
                     console.warn('Guest Login: Failed to create session in DB. Using Mock Store.', sessionError.message);
                     sessionStore[token] = { user_id: user.id, expires_at: expiresAt };
                 }
             } catch (e) {
                 console.warn('Guest Login: Session creation exception. Using Mock Store.', e);
                 sessionStore[token] = { user_id: user.id, expires_at: expiresAt };
             }
    
            res.json({ user, token });
    
        } catch (err) {
            console.error('Guest Login Failed:', err);
            res.status(500).json({ error: 'Login failed. Database configuration required.' });
        }
    });


// --- Wallet & Ledger Endpoints ---

// Get Wallet Balance (Real-Time Calculated)
app.get('/api/wallet/balance', authMiddleware, async (req, res) => {
    try {
        const balance = await ledgerService.getWalletBalance(req.user.id);
        res.json(balance);
    } catch (err) {
        console.error('Wallet Balance Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get Wallet Transactions (Ledger)
app.get('/api/wallet/transactions', authMiddleware, async (req, res) => {
    try {
        const history = await ledgerService.getLedgerHistory(req.user.id);
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Admin Ledger Visibility ---

app.get('/api/admin/ledger/entries', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('ledger_entries')
            .select('*, users(email)')
            .order('created_at', { ascending: false })
            .limit(100);
            
        if (error) throw error;
        res.json(data);
    } catch (err) {
         if (err.code === 'PGRST205' || err.message?.includes('relation')) {
             return res.json([]); 
         }
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/deposits', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('blockchain_transactions')
            .select('*, users(email)')
            .eq('status', 'credited')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Admin Deposits Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- Public Config ---
app.get('/api/config/public', (req, res) => {
    const config = configService.getAll();
    res.json({
        usdt_withdrawal_fee: config.usdt_withdrawal_fee,
        min_usdt_withdrawal: config.min_usdt_withdrawal,
        daily_withdrawal_limit: config.daily_withdrawal_limit,
        withdrawals_enabled: config.withdrawals_enabled,
        deposits_enabled: config.deposits_enabled,
        exchanges_enabled: config.exchanges_enabled
    });
});

// Admin: Update System Config
app.post('/api/admin/config/update', async (req, res) => {
    try {
        const result = await configService.update(req.body);
        if (result.success) {
            await auditService.log('admin', null, 'CONFIG_UPDATE', null, req.body, req.clientIp);
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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
        let withdrawal = null;
        try {
            const { data, error } = await supabase
                .from('usdt_withdrawals')
                .insert({
                    id: withdrawalId,
                    user_id: userId,
                    destination_address,
                    usdt_amount: amount,
                    fee: fee,
                    net_amount: amount, 
                    status: 'pending'
                })
                .select()
                .single();

            if (error) throw error;
            withdrawal = data;

        } catch (dbError) {
            console.error('Withdrawal Insert Error:', dbError);
            // Fallback for missing tables
            if (dbError.code === 'PGRST205' || dbError.message?.includes('relation')) {
                console.warn('usdt_withdrawals table missing. Simulating withdrawal request.');
                withdrawal = {
                    id: withdrawalId,
                    user_id: userId,
                    destination_address,
                    usdt_amount: amount,
                    fee,
                    net_amount: amount,
                    status: 'pending',
                    created_at: new Date().toISOString()
                };
                // Queue in memory or just log?
                // For now, we just return success so UI doesn't break.
                // In a real scenario, we'd need a queue.
            } else {
                 // Rollback lock if it was a real DB error (not missing table)
                 await ledgerService.failWithdrawal(userId, totalAmount, withdrawalId); 
                 throw dbError;
            }
        }

        // 3. Log Audit
        try {
             await auditService.log('user', userId, 'WITHDRAW_USDT_REQUEST', withdrawalId, { amount, fee, destination_address }, req.clientIp);
        } catch (e) { console.warn('Audit log failed', e.message); }

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


// --- Bank Account Management ---

app.get('/api/bank-accounts', authMiddleware, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('bank_accounts')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        // Handle missing table gracefully if migration hasn't run
        if (err.code === 'PGRST205' || err.message?.includes('relation')) {
            return res.json([]);
        }
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/bank-accounts', authMiddleware, requireKycApproved, async (req, res) => {
    const { account_number, ifsc_code, account_holder_name, is_primary } = req.body;

    if (!account_number || !ifsc_code || !account_holder_name) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // If this is set to primary, unset others
        if (is_primary) {
            await supabase
                .from('bank_accounts')
                .update({ is_primary: false })
                .eq('user_id', req.user.id);
        }

        const { data, error } = await supabase
            .from('bank_accounts')
            .insert({
                user_id: req.user.id,
                account_number,
                ifsc_code,
                account_holder_name,
                is_primary: is_primary || false
            })
            .select()
            .single();

        if (error) throw error;
        
        await auditService.log('user', req.user.id, 'BANK_ADD', data.id, { account_number: '****' + account_number.slice(-4) }, req.clientIp);
        
        res.json(data);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/bank-accounts/:id', authMiddleware, async (req, res) => {
    try {
        const { error } = await supabase
            .from('bank_accounts')
            .delete()
            .eq('id', req.params.id)
            .eq('user_id', req.user.id);

        if (error) throw error;
        
        await auditService.log('user', req.user.id, 'BANK_DELETE', req.params.id, null, req.clientIp);
        
        res.json({ success: true });
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
    const { usdt_amount, bank_account_id } = req.body;
    
    if (!usdt_amount || usdt_amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!bank_account_id) {
        return res.status(400).json({ error: 'Bank Account ID is required' });
    }

    try {
        // Compliance Check
        await complianceService.checkExchangeLimit(req.user.id, usdt_amount);

        const result = await exchangeService.createExchangeOrder(req.user.id, usdt_amount, bank_account_id);
        
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

// Admin: Get All Users
app.get('/api/admin/users', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Ban/Unban User
app.post('/api/admin/users/:id/ban', async (req, res) => {
    const { ban } = req.body; // true to ban, false to unban
    try {
        const { error } = await supabase
            .from('users')
            .update({ is_banned: ban })
            .eq('id', req.params.id);
            
        if (error) throw error;
        await auditService.log('admin', null, ban ? 'USER_BAN' : 'USER_UNBAN', req.params.id, {}, req.clientIp);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Manual KYC Action
app.post('/api/admin/users/:id/kyc', async (req, res) => {
    const { status, reason } = req.body; // 'approved', 'rejected'
    try {
        const { error } = await supabase
            .from('users')
            .update({ 
                kyc_status: status,
                kyc_rejection_reason: reason || null,
                kyc_verified_at: status === 'approved' ? new Date() : null
            })
            .eq('id', req.params.id);
            
        if (error) throw error;
        await auditService.log('admin', null, 'KYC_MANUAL_UPDATE', req.params.id, { status, reason }, req.clientIp);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Stats
app.get('/api/admin/stats', async (req, res) => {
    try {
        // 1. Total Volume (Deposits)
        const { data: deposits } = await supabase
            .from('blockchain_transactions')
            .select('amount')
            .eq('status', 'credited');
        const totalDeposits = deposits ? deposits.reduce((sum, tx) => sum + parseFloat(tx.amount), 0) : 0;

        // 2. Total Volume (Withdrawals)
        const { data: withdrawals } = await supabase
            .from('usdt_withdrawals')
            .select('usdt_amount')
            .eq('status', 'completed');
        const totalWithdrawals = withdrawals ? withdrawals.reduce((sum, tx) => sum + parseFloat(tx.usdt_amount), 0) : 0;

        // 3. Pending Payouts
        const { count: pendingPayoutsCount } = await supabase
            .from('payout_orders')
            .select('id', { count: 'exact' })
            .eq('status', 'PENDING');

        // 4. Treasury Balance (System Wallet)
        // This is tricky if we don't have a direct way to query TRON node.
        // We can use the walletService or tronService if they expose a balance check.
        // For now, we'll return what we know from DB or mock.
        // Or we can return the 'system' wallet balance from 'wallets' table if we are tracking it there.
        const { data: systemWallet } = await supabase
            .from('wallets')
            .select('balance, address')
            .eq('type', 'system')
            .maybeSingle();

        res.json({
            total_deposits_usdt: totalDeposits,
            total_withdrawals_usdt: totalWithdrawals,
            pending_payouts_count: pendingPayoutsCount || 0,
            treasury_balance: systemWallet ? systemWallet.balance : 0,
            treasury_address: systemWallet ? systemWallet.address : null
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

// Get Payout Logs (Audit)
app.get('/api/admin/exchange/logs/:order_id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('audit_logs')
            .select('*')
            .eq('reference_id', req.params.order_id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        if (err.code === 'PGRST205' || err.message?.includes('relation')) {
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

// --- Payout System Endpoints (INR Payouts) ---

// 1. Request Payout
app.post('/api/payout/request', authMiddleware, requireKycApproved, async (req, res) => {
    const { usdt_amount, bank_account_id } = req.body;
    
    if (!usdt_amount || usdt_amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
    }

    try {
        const order = await payoutService.requestPayout(req.user.id, usdt_amount, bank_account_id);
        
        await auditService.log('user', req.user.id, 'PAYOUT_REQUEST', order.id, { usdt_amount, inr_amount: order.inr_amount }, req.clientIp);
        res.json({ success: true, order });
    } catch (err) {
        // Log failure
        await auditService.log('user', req.user.id, 'PAYOUT_REQUEST_FAILED', null, { reason: err.message }, req.clientIp);
        res.status(400).json({ error: err.message });
    }
});

// 2. Get Payout Status
app.get('/api/payout/status/:id', authMiddleware, async (req, res) => {
    try {
        const { data: order, error } = await supabase
            .from('payout_orders')
            .select('*')
            .eq('id', req.params.id)
            .eq('user_id', req.user.id) // Ensure ownership
            .single();

        if (error || !order) return res.status(404).json({ error: 'Payout order not found' });
        res.json(order);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Get Payout History
app.get('/api/payout/history', authMiddleware, async (req, res) => {
    try {
        const { data: orders, error } = await supabase
            .from('payout_orders')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Admin: Get All Payouts
app.get('/api/admin/payouts', async (req, res) => {
    try {
        const { data: orders, error } = await supabase
            .from('payout_orders')
            .select('*, users(email, account_holder_name)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(orders);
    } catch (err) {
        if (err.code === 'PGRST205' || err.message?.includes('relation')) return res.json([]);
        res.status(500).json({ error: err.message });
    }
});

// 5. Admin: Payout Action (Manual Approval/Reject)
app.post('/api/admin/payout/:id/action', async (req, res) => {
    const { action } = req.body; // 'approve_success', 'reject_refund'
    const orderId = req.params.id;

    try {
        await payoutService.adminAction(orderId, action);
        
        await auditService.log('admin', null, 'PAYOUT_ADMIN_ACTION', orderId, { action }, req.clientIp);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
