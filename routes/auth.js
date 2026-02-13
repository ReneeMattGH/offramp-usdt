const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const { authMiddleware } = require('../middleware/auth');

router.post('/send-otp', async (req, res) => {
    try {
        const { accountNumber } = req.body;
        await authService.sendOTP(accountNumber);
        res.json({ success: true, message: 'OTP sent' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { accountNumber, otp } = req.body;
        const result = await authService.login(accountNumber, otp);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(401).json({ error: err.message });
    }
});

router.post('/signup', async (req, res) => {
    try {
        const result = await authService.signup(req.body);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/me', authMiddleware, async (req, res) => {
    res.json(req.user);
});

router.post('/guest-login', async (req, res) => {
    try {
        const { referralCode } = req.body;
        const result = await authService.guestLogin(referralCode);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
