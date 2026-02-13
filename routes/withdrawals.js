const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabase');
const ledgerService = require('../services/ledgerService');
const configService = require('../services/configService');
const complianceService = require('../services/complianceService');
const { authMiddleware } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.get('/usdt', authMiddleware, async (req, res) => {
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

router.post('/usdt', authMiddleware, async (req, res) => {
    try {
        const { destination_address, amount } = req.body;
        const idempotencyKey = req.headers['idempotency-key'] || uuidv4();

        const config = configService.getAll();
        if (config.usdt_withdrawals_paused) {
            throw new Error('USDT withdrawals are currently paused');
        }

        if (req.user.kyc_status !== 'approved') {
            throw new Error('KYC verification required');
        }

        // Check daily limit
        await complianceService.checkUSDTWithdrawalLimit(req.user.id, amount);

        const fee = 5.0; // This should ideally come from config
        const totalAmount = parseFloat(amount) + fee;

        // 1. Create withdrawal record in pending state
        const { data: withdrawal, error: createError } = await supabase
            .from('usdt_withdrawals')
            .insert({
                user_id: req.user.id,
                destination_address,
                usdt_amount: amount,
                fee: fee,
                net_amount: amount,
                status: 'pending',
                idempotency_key: idempotencyKey
            })
            .select()
            .single();

        if (createError) {
            if (createError.code === '23505') { // Duplicate idempotency key
                const { data: existing } = await supabase
                    .from('usdt_withdrawals')
                    .select('*')
                    .eq('idempotency_key', idempotencyKey)
                    .single();
                return res.json(existing);
            }
            throw createError;
        }

        // 2. Lock funds in ledger
        try {
            await ledgerService.lockFundsForWithdrawal(req.user.id, totalAmount, withdrawal.id);
        } catch (lockError) {
            // Rollback withdrawal record if lock fails
            await supabase.from('usdt_withdrawals').delete().eq('id', withdrawal.id);
            throw lockError;
        }

        res.json(withdrawal);
    } catch (err) {
        console.error('Withdrawal creation error:', err);
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
