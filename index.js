require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const config = require('./config');

const configService = require('./services/configService');
const tronService = require('./services/tronService');
const payoutService = require('./services/payoutService');
const withdrawalWorker = require('./services/withdrawalWorker');

const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const referralRoutes = require('./routes/referral');
const kycRoutes = require('./routes/kyc');
const walletRoutes = require('./routes/wallet');
const exchangeRoutes = require('./routes/exchange');
const withdrawalRoutes = require('./routes/withdrawals');
const configRoutes = require('./routes/config');
const webhookRoutes = require('./routes/webhook');

const app = express();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    req.clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    next();
});

app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api', kycRoutes); // Handles /api/verify-kyc
app.use('/api', walletRoutes); // Handles /api/generate-address
app.use('/api/exchange', exchangeRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/withdraw', withdrawalRoutes);
app.use('/api/config', configRoutes);
app.use('/api/webhooks', webhookRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'success', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.send('API Server Running');
});

const PORT = config.PORT;

async function init() {
    try {
        await configService.loadConfig();
        
        if (config.NODE_ENV !== 'production' || !process.env.VERCEL) {
            tronService.startListener();
            payoutService.startWorker();
            withdrawalWorker.start();
        }
        
        if (require.main === module) {
            app.listen(PORT, () => {
                console.log(`Server listening on port ${PORT}`);
            });
        }
    } catch (err) {
        console.error('Initialization failed:', err.message);
    }
}

init();

module.exports = app;
