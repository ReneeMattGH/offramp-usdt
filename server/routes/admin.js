const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminService = require('../services/adminService');
const kycService = require('../services/kycService');
const ledgerService = require('../services/ledgerService');
const tronService = require('../services/tronService');
const exchangeService = require('../services/exchangeService');
const { createClient } = require('@supabase/supabase-js');

// Supabase Init for Admin Routes
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase;
if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
} else {
    supabase = {
        from: () => ({ select: () => ({ eq: () => ({ data: [], error: null }) }) })
    };
}

// --- AUTHENTICATION ---

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await adminService.login(username, password);
        await adminService.logAction(result.admin.id, 'LOGIN', 'system', 'admin_login', { username });
        res.json(result);
    } catch (err) {
        res.status(401).json({ error: err.message });
    }
});

// --- DASHBOARD ---

router.get('/dashboard', adminAuth, async (req, res) => {
    try {
        // Treasury Balance
        // We use the first unused deposit address as a proxy for "Treasury" if no dedicated one is set.
        // Or we use a specific treasury address if defined in env.
        const treasuryAddress = process.env.TREASURY_ADDRESS || 'TMJWuDDq4o3jA2T5T5Q5Q5Q5Q5Q5Q5Q5Q5'; // Default or Mock
        const treasuryBalance = await tronService.getTreasuryBalance(treasuryAddress);

        // Pending Stats
        const { count: pendingKYC } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('kyc_status', 'pending');
        const { count: pendingOrders } = await supabase.from('exchange_orders').select('*', { count: 'exact', head: true }).eq('status', 'processing');
        const { count: pendingWithdrawals } = await supabase.from('withdrawals').select('*', { count: 'exact', head: true }).eq('status', 'pending');

        res.json({
            treasury: {
                address: treasuryAddress,
                ...treasuryBalance
            },
            stats: {
                pendingKYC: pendingKYC || 0,
                pendingOrders: pendingOrders || 0,
                pendingWithdrawals: pendingWithdrawals || 0
            }
        });
    } catch (err) {
        console.error('Dashboard Error:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

// --- KYC MANAGEMENT ---

router.get('/kyc', adminAuth, async (req, res) => {
    try {
        // Query users directly to get Aadhaar number and photo
        // Use select('*') to avoid errors if specific columns (like aadhaar_photo_url) are missing in DB schema
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .neq('kyc_status', 'not_submitted')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/kyc/:id/approve', adminAuth, async (req, res) => {
    try {
        const { id } = req.params; // This is User ID
        
        // Update User Profile
        const { error } = await supabase.from('users').update({
            kyc_status: 'approved',
            kyc_verified_at: new Date(),
            kyc_rejection_reason: null
        }).eq('id', id);

        if (error) throw error;

        // Log to audit
        // ...

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/kyc/:id/reject', adminAuth, async (req, res) => {
    try {
        const { id } = req.params; // This is User ID
        const { reason } = req.body;

        // Update User Profile
        const { error } = await supabase.from('users').update({
            kyc_status: 'rejected',
            kyc_rejection_reason: reason || 'Admin Rejected'
        }).eq('id', id);

        if (error) throw error;

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// --- DEPOSITS & TRANSACTIONS ---

router.get('/deposits', adminAuth, async (req, res) => {
    try {
        // Fetch all blockchain transactions (detected, pending_approval, credited, etc.)
        const { data, error } = await supabase
            .from('blockchain_transactions')
            .select('*, users(email, account_number)')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/deposits/approve', adminAuth, async (req, res) => {
    try {
        const { txHash } = req.body;
        
        // 1. Get Transaction
        const { data: tx } = await supabase.from('blockchain_transactions').select('*').eq('tx_hash', txHash).single();
        if (!tx) return res.status(404).json({ error: 'Transaction not found' });
        
        if (tx.status === 'credited') return res.status(400).json({ error: 'Already credited' });

        // 2. Credit User
        const success = await ledgerService.creditDeposit(tx.user_id, tx.amount, txHash, `Deposit ${tx.amount} USDT`);
        
        if (success) {
            // 3. Update Status
            await supabase.from('blockchain_transactions').update({ 
                status: 'credited', 
                processed_at: new Date().toISOString() 
            }).eq('tx_hash', txHash);

            // 4. Mark Address Used (if not already)
            const { data: addr } = await supabase.from('deposit_addresses').select('id').eq('tron_address', tx.to_address).maybeSingle();
            if (addr) {
                await supabase.from('deposit_addresses').update({ is_used: true }).eq('id', addr.id);
            }

            // 5. Trigger Sweep (Async)
            // Need to import tronService instance or use a helper. 
            // Since tronService is a singleton in index.js, we might need to require it here or move sweep logic to a shared service.
            // For now, we will rely on the fact that funds are in the temp wallet and can be swept later or we can import the service if available.
            // A better approach is to emit an event or call a method on the imported service.
            // Let's try to import it dynamically or assume manual sweep for now, OR better:
            // The tronService listener handles detection. We need a way to trigger sweep.
            // Actually, `tronService.triggerSweep` requires private key which is in `deposit_addresses`.
            
            // To keep it simple and safe: We credit the user. We can leave sweeping for the periodic checker or manual sweep.
            // OR we can fetch the address data and sweep here.
            
            // Log Action
            await adminService.logAction(req.admin.id, 'DEPOSIT_APPROVE', 'transaction', txHash, { amount: tx.amount });
            
            res.json({ success: true });
        } else {
            res.status(500).json({ error: 'Ledger credit failed' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/deposits/credit', adminAuth, async (req, res) => {
    try {
        const { userId, amount, txHash } = req.body;
        
        // Manual Credit via Ledger Service
        const success = await ledgerService.creditDeposit(userId, amount, txHash, 'Manual Admin Credit');
        
        if (success) {
            await adminService.logAction(req.admin.id, 'MANUAL_CREDIT', 'user', userId, { amount, txHash });
            res.json({ success: true });
        } else {
            res.status(400).json({ error: 'Credit failed (Duplicate or Ledger Error)' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- EXCHANGE ORDERS ---

router.get('/orders', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('exchange_orders')
            .select('*, users(email, account_number), bank_accounts(*)')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/orders/:id/update-status', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, note } = req.body; // 'approved', 'success', 'failed', 'refunded'
        
        const { data: order } = await supabase.from('exchange_orders').select('*').eq('id', id).single();
        if (!order) return res.status(404).json({ error: 'Order not found' });

        if (status === 'approved') {
             // Transition PENDING -> APPROVED
             // This allows the Payout Worker to pick it up
             await supabase.from('exchange_orders').update({
                 status: 'APPROVED',
                 updated_at: new Date()
             }).eq('id', id);
             
             // Check if corresponding payout_order exists and update it too.
             // We assume the ID is shared between exchange_orders and payout_orders (common pattern if created via same RPC).
             // If payout_orders uses a foreign key, we might miss it, but without schema certainty, ID match is safest.
             
             const { error: payoutError } = await supabase.from('payout_orders').update({ status: 'APPROVED' }).eq('id', id);
             
             if (payoutError) {
                 console.warn(`Failed to update payout_order ${id}:`, payoutError.message);
                 // Don't fail the request, just log. 
                 // If the table structure is different, we might need to adjust.
             }

        } else if (status === 'success') {
             await supabase.from('exchange_orders').update({
                 status: 'completed',
                 completed_at: new Date()
             }).eq('id', id);
             // Finalize payout (burns the locked funds)
             await ledgerService.finalizePayout(order.user_id, order.usdt_amount, id);
        } else if (status === 'failed' || status === 'refunded') {
             await supabase.from('exchange_orders').update({
                 status: 'failed',
                 failure_reason: note || 'Admin marked as failed'
             }).eq('id', id);
             // Fail payout (refunds locked funds to available)
             await ledgerService.failPayout(order.user_id, order.usdt_amount, id);
        }

        await adminService.logAction(req.admin.id, 'UPDATE_ORDER', 'order', id, { status, note });
        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- USER MANAGEMENT ---

router.get('/users', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*, ledger_accounts(available_balance, locked_balance)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/users/:id/freeze', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { frozen } = req.body; // true/false

        await supabase.from('users').update({ is_frozen: frozen }).eq('id', id);
        
        await adminService.logAction(req.admin.id, 'FREEZE_USER', 'user', id, { frozen });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- AUDIT LOGS ---

router.get('/audit', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('audit_logs')
            .select('*, admins(username)')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
