const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const config = require('../config');
const payoutService = require('../services/payoutService');

router.post('/razorpay', express.json(), async (req, res) => {
    try {
        const secret = config.RAZORPAY.WEBHOOK_SECRET;
        if (secret) {
            const signature = req.headers['x-razorpay-signature'];
            const expectedSignature = crypto
                .createHmac('sha256', secret)
                .update(JSON.stringify(req.body))
                .digest('hex');

            if (signature !== expectedSignature) {
                return res.status(400).send('Invalid signature');
            }
        }

        await payoutService.handleWebhook(req.body);
        res.json({ status: 'ok' });
    } catch (err) {
        console.error('Webhook error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
