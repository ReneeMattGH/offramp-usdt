const express = require('express');
const router = express.Router();
const multer = require('multer');
const kycService = require('../services/kycService');
const { authMiddleware } = require('../middleware/auth');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

router.post('/verify-kyc', authMiddleware, upload.single('aadhaar_image'), async (req, res) => {
    try {
        const result = await kycService.submitKyc(
            req.user.id,
            req.body,
            req.clientIp,
            req.file
        );
        res.json(result);
    } catch (err) {
        console.error('KYC submission error:', err);
        res.status(400).json({ error: err.message });
    }
});

router.get('/status', authMiddleware, async (req, res) => {
    try {
        const status = await kycService.getKycStatus(req.user.id);
        res.json(status);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
