const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabase');
const exchangeService = require('../services/exchangeService');
const { authMiddleware } = require('../middleware/auth');

router.get('/rate', async (req, res) => {
    try {
        const rate = await exchangeService.getLiveRate();
        res.json({ rate });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/orders', authMiddleware, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('exchange_orders')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/create', authMiddleware, async (req, res) => {
    try {
        const { usdt_amount, bank_account_id, bank_details } = req.body;
        
        if (req.user.kyc_status !== 'approved') {
            throw new Error('KYC verification required for exchange');
        }

        const result = await exchangeService.createExchangeOrder(
            req.user.id,
            usdt_amount,
            bank_account_id,
            bank_details
        );
        res.json(result);
    } catch (err) {
        console.error('Exchange creation error:', err);
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
