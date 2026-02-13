const express = require('express');
const router = express.Router();
const configService = require('../services/configService');

router.get('/public', (req, res) => {
    try {
        const config = configService.getAll();
        // Return only safe public config
        const publicConfig = {
            kyc_mode: config.kyc_mode,
            exchanges_enabled: config.exchanges_enabled,
            usdt_withdrawals_paused: config.usdt_withdrawals_paused,
            exchange_spread_percent: config.exchange_spread_percent,
            limits: config.limits
        };
        res.json(publicConfig);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
