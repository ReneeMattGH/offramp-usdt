import express from 'express';
import cors from 'cors';
import multer from 'multer';
import config from './config/index.js';
import authController from './controllers/authController.js';
import walletController from './controllers/walletController.js';
import exchangeController from './controllers/exchangeController.js';
import adminController from './controllers/adminController.js';
import referralController from './controllers/referralController.js';
import webhookController from './controllers/webhookController.js';
import { kycController } from './controllers/kycController.js';
import tronWorker from './workers/tronWorker.js';
import payoutWorker from './workers/payoutWorker.js';
import withdrawalWorker from './workers/withdrawalWorker.js';
import configService from './services/configService.js';
import { authenticate } from './middleware/authMiddleware.js';
import { adminAuth } from './middleware/adminAuth.js';

const app = express();

// Multer setup for KYC documents
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const apiRouter = express.Router();

// Auth Routes
const authRouter = express.Router();
authRouter.post('/send-otp', authController.sendOTP.bind(authController));
authRouter.post('/signup', authController.signup.bind(authController));
authRouter.post('/login', authController.login.bind(authController));

apiRouter.use('/auth', authRouter);

// Wallet Routes
const walletRouter = express.Router();
walletRouter.get('/balance', authenticate, walletController.getBalance.bind(walletController));
walletRouter.post('/generate-address', authenticate, walletController.generateAddress.bind(walletController));

apiRouter.use('/wallet', walletRouter);

// Exchange Routes
const exchangeRouter = express.Router();
exchangeRouter.get('/rate', exchangeController.getRate.bind(exchangeController));
exchangeRouter.get('/orders', authenticate, exchangeController.getOrders.bind(exchangeController));
exchangeRouter.post('/create-order', authenticate, exchangeController.createOrder.bind(exchangeController));

apiRouter.use('/exchange', exchangeRouter);

// KYC Routes
const kycRouter = express.Router();
kycRouter.post('/verify-kyc', authenticate, upload.single('aadhaar_image'), kycController.submitKyc.bind(kycController));
kycRouter.get('/status', authenticate, kycController.getStatus.bind(kycController));

apiRouter.use('/kyc', kycRouter);

// Referral Routes
const referralRouter = express.Router();
referralRouter.get('/stats', authenticate, referralController.getStats.bind(referralController));

apiRouter.use('/referral', referralRouter);

// Webhook Routes
const webhookRouter = express.Router();
webhookRouter.post('/razorpay', webhookController.handleRazorpay.bind(webhookController));

apiRouter.use('/webhooks', webhookRouter);

// Admin Routes
const adminRouter = express.Router();
adminRouter.post('/login', adminController.login.bind(adminController));
adminRouter.get('/dashboard', adminAuth, adminController.getDashboard.bind(adminController));
adminRouter.get('/kyc', adminAuth, adminController.getKycList.bind(adminController));
adminRouter.post('/kyc/:id/approve', adminAuth, adminController.approveKyc.bind(adminController));
adminRouter.post('/kyc/:id/reject', adminAuth, adminController.rejectKyc.bind(adminController));
adminRouter.get('/deposits', adminAuth, adminController.getDeposits.bind(adminController));
adminRouter.post('/deposits/:txHash/approve', adminAuth, adminController.approveDeposit.bind(adminController));
adminRouter.post('/manual-credit', adminAuth, adminController.manualCredit.bind(adminController));
adminRouter.get('/orders', adminAuth, adminController.getOrders.bind(adminController));
adminRouter.post('/orders/:id/status', adminAuth, adminController.updateOrderStatus.bind(adminController));
adminRouter.get('/users', adminAuth, adminController.getUsers.bind(adminController));
adminRouter.post('/users/:id/freeze', adminAuth, adminController.freezeUser.bind(adminController));
adminRouter.get('/audit', adminAuth, adminController.getAuditLogs.bind(adminController));

apiRouter.use('/admin', adminRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'success', 
    timestamp: new Date().toISOString(),
    env: config.nodeEnv
  });
});

app.use('/api', apiRouter);

// Initialize Workers & Start Server
const startServer = async () => {
  try {
    // 0. Load Configuration from DB
    await configService.loadConfig();
    console.log('✅ Configuration loaded from database');

    // 1. Start Persistent Workers (Only if not in serverless environment)
    if (process.env.RUN_WORKERS === 'true' || config.nodeEnv === 'production') {
      tronWorker.start();
      payoutWorker.start();
      withdrawalWorker.start();
      console.log('✅ Background workers started');
    }

    // 2. Start Express Server
    app.listen(config.port, () => {
      console.log(`🚀 Server running on port ${config.port} in ${config.nodeEnv} mode`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
