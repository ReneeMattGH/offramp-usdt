const express = require('express');
const router = express.Router();
const walletService = require('../services/walletService');
const { authMiddleware } = require('../middleware/auth');

router.post('/generate-address', authMiddleware, async (req, res) => {
    try {
        // Check if user is KYC approved
        if (req.user.kyc_status !== 'approved') {
            return res.status(403).json({ 
                error: 'KYC_REQUIRED', 
                message: 'You must complete KYC verification before generating a deposit address.' 
            });
        }

        const address = await walletService.generateDepositAddress(req.user.id);
        res.json({ success: true, address });
    } catch (err) {
        console.error('Generate address error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
