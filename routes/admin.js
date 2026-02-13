const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminService = require('../services/adminService');

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await adminService.login(username, password);
        res.json(result);
    } catch (err) {
        res.status(401).json({ error: err.message });
    }
});

router.get('/dashboard', adminAuth, async (req, res) => {
    try {
        const dashboardData = await adminService.getDashboardData();
        res.json(dashboardData);
    } catch (err) {
        console.error('Dashboard Error:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

// --- KYC MANAGEMENT ---

router.get('/kyc', adminAuth, async (req, res) => {
    try {
        const data = await adminService.getKycList();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/kyc/:id/approve', adminAuth, async (req, res) => {
    try {
        const result = await adminService.approveKyc(req.params.id, req.admin.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/kyc/:id/reject', adminAuth, async (req, res) => {
    try {
        const result = await adminService.rejectKyc(req.params.id, req.body.reason, req.admin.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DEPOSITS & TRANSACTIONS ---

router.get('/deposits', adminAuth, async (req, res) => {
    try {
        const data = await adminService.getDeposits();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/deposits/approve', adminAuth, async (req, res) => {
    try {
        const result = await adminService.approveDeposit(req.body.txHash, req.admin.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/deposits/credit', adminAuth, async (req, res) => {
    try {
        const { userId, amount, txHash } = req.body;
        const result = await adminService.manualCredit(userId, amount, txHash, req.admin.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- EXCHANGE ORDERS ---

router.get('/orders', adminAuth, async (req, res) => {
    try {
        const data = await adminService.getOrders();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/orders/:id/update-status', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, note } = req.body;
        const result = await adminService.updateOrderStatus(id, status, note, req.admin.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- USER MANAGEMENT ---

router.get('/users', adminAuth, async (req, res) => {
    try {
        const data = await adminService.getUsers();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/users/:id/freeze', adminAuth, async (req, res) => {
    try {
        const result = await adminService.freezeUser(req.params.id, req.body.frozen, req.admin.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- AUDIT LOGS ---

router.get('/audit', adminAuth, async (req, res) => {
    try {
        const data = await adminService.getAuditLogs();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
