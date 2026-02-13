const express = require('express');
const router = express.Router();
const referralService = require('../services/referralService');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
    try {
        await referralService.ensureReferralCode(req.user.id);
        const stats = await referralService.getReferralStats(req.user.id);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load referral stats' });
    }
});

module.exports = router;
