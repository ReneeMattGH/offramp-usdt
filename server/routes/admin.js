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
        const { count: pendingKYC } = await supabase.from('kyc_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending');
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
        const { data, error } = await supabase
            .from('kyc_submissions')
            .select('*, users(email, account_number, account_holder_name)')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/kyc/:id/approve', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { data: submission } = await supabase.from('kyc_submissions').select('user_id').eq('id', id).single();
        
        if (!submission) return res.status(404).json({ error: 'Submission not found' });

        // Update Submission
        await supabase.from('kyc_submissions').update({
            status: 'approved',
            verified_at: new Date(),
            rejection_reason: null
        }).eq('id', id);

        // Update User Profile
        await supabase.from('users').update({
            kyc_status: 'verified',
            kyc_verified_at: new Date()
        }).eq('id', submission.user_id);

        await adminService.logAction(req.admin.id, 'APPROVE_KYC', 'user', submission.user_id, { submission_id: id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/kyc/:id/reject', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const { data: submission } = await supabase.from('kyc_submissions').select('user_id').eq('id', id).single();

        if (!submission) return res.status(404).json({ error: 'Submission not found' });

        await supabase.from('kyc_submissions').update({
            status: 'rejected',
            rejection_reason: reason
        }).eq('id', id);

        await supabase.from('users').update({
            kyc_status: 'rejected',
            kyc_rejection_reason: reason
        }).eq('id', submission.user_id);

        await adminService.logAction(req.admin.id, 'REJECT_KYC', 'user', submission.user_id, { submission_id: id, reason });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DEPOSITS & TRANSACTIONS ---

router.get('/deposits', adminAuth, async (req, res) => {
    try {
        // Fetch all deposit ledger entries
        const { data, error } = await supabase
            .from('ledger_entries')
            .select('*, users(email, account_number)')
            .eq('type', 'deposit')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        res.json(data);
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
        const { status, note } = req.body; // 'success', 'failed', 'refunded'
        
        const { data: order } = await supabase.from('exchange_orders').select('*').eq('id', id).single();
        if (!order) return res.status(404).json({ error: 'Order not found' });

        if (status === 'success') {
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
