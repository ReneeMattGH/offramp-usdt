import express from 'express';
import { createServer } from 'http';
import wsService from './services/wsService.js';
import bscService from './services/bscService.js';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/index.js';
import authController from './controllers/authController.js';
import walletController from './controllers/walletController.js';
import exchangeController from './controllers/exchangeController.js';
import withdrawalController from './controllers/withdrawalController.js';
import payoutController from './controllers/payoutController.js';
import adminController from './controllers/adminController.js';
import referralController from './controllers/referralController.js';
import { kycController } from './controllers/kycController.js';
import bankAccountController from './controllers/bankAccountController.js';
import tronWorker from './workers/tronWorker.js';
import payoutWorker from './workers/payoutWorker.js';
import withdrawalWorker from './workers/withdrawalWorker.js';
import configService from './services/configService.js';
import { authenticate } from './middleware/authMiddleware.js';
import { adminAuth } from './middleware/adminAuth.js';
import walletService from './services/walletService.js';
import exchangeService from './services/exchangeService.js';
import supabase from './utils/supabase.js';

const app = express();
const server = createServer(app);

// Initialize WebSocket Service
wsService.init(server);

// Multer setup for KYC documents
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Health Check
app.get('/health', async (req, res) => {
  try {
    const { data, error } = await supabase.from('system_settings').select('id').limit(1).maybeSingle();
    if (error) throw error;
    res.json({ 
      status: 'ok', 
      db: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(503).json({ 
      status: 'degraded', 
      db: 'error', 
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const apiRouter = express.Router();

// Auth Routes
const authRouter = express.Router();
authRouter.post('/send-otp', authController.sendOTP.bind(authController));
authRouter.post('/verify-otp', authController.verifyOTPOnly.bind(authController));
authRouter.post('/signup', authController.signup.bind(authController));
authRouter.post('/login', authController.login.bind(authController));
authRouter.get('/me', authController.me.bind(authController));
authRouter.post('/guest-login', authController.guestLogin.bind(authController));

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

// Withdrawal Routes (USDT to Wallet)
const withdrawalRouter = express.Router();
withdrawalRouter.post('/', authenticate, withdrawalController.requestWithdrawal.bind(withdrawalController));
withdrawalRouter.get('/my', authenticate, withdrawalController.getMyWithdrawals.bind(withdrawalController));

apiRouter.use('/withdrawal', withdrawalRouter);

// Payout Routes (USDT to INR)
const payoutRouter = express.Router();
payoutRouter.post('/', authenticate, payoutController.requestPayout.bind(payoutController));
payoutRouter.get('/my', authenticate, payoutController.getMyPayouts.bind(payoutController));

apiRouter.use('/payout', payoutRouter);

// KYC Routes
const kycRouter = express.Router();
kycRouter.post('/verify-kyc', authenticate, upload.single('aadhaar_image'), kycController.submitKyc.bind(kycController));
kycRouter.get('/status', authenticate, kycController.getStatus.bind(kycController));

apiRouter.use('/kyc', kycRouter);

// Bank Account Routes
const bankRouter = express.Router();
bankRouter.get('/my', authenticate, bankAccountController.listMyAccounts.bind(bankAccountController));
bankRouter.post('/', authenticate, bankAccountController.addAccount.bind(bankAccountController));
bankRouter.delete('/:id', authenticate, bankAccountController.deleteAccount.bind(bankAccountController));

apiRouter.use('/bank', bankRouter);

// Referral Routes
const referralRouter = express.Router();
referralRouter.get('/stats', authenticate, referralController.getStats.bind(referralController));

apiRouter.use('/referral', referralRouter);

// Admin Routes
const adminRouter = express.Router();
adminRouter.post('/login', adminController.login.bind(adminController));
adminRouter.get('/me', adminAuth, adminController.me.bind(adminController));
adminRouter.post('/update-credentials', adminAuth, adminController.updateMyCredentials.bind(adminController));
adminRouter.post('/add-admin', adminAuth, adminController.addAdmin.bind(adminController));
adminRouter.get('/list', adminAuth, adminController.listAllAdmins.bind(adminController));
adminRouter.post('/:id/update', adminAuth, adminController.updateOtherAdmin.bind(adminController));
adminRouter.delete('/:id', adminAuth, adminController.deleteOtherAdmin.bind(adminController));
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

// Admin Withdrawal APIs (USDT to Wallet)
adminRouter.get('/withdrawals', adminAuth, withdrawalController.adminListAll.bind(withdrawalController));
adminRouter.post('/withdrawals/:id/approve', adminAuth, withdrawalController.adminProcess.bind(withdrawalController));
adminRouter.post('/withdrawals/:id/reject', adminAuth, withdrawalController.adminReject.bind(withdrawalController));

// Admin Payout APIs (USDT to INR)
adminRouter.get('/payouts', adminAuth, payoutController.adminListAll.bind(payoutController));
adminRouter.post('/payouts/:id/approve', adminAuth, payoutController.adminProcess.bind(payoutController));
adminRouter.post('/payouts/:id/reject', adminAuth, payoutController.adminReject.bind(payoutController));

adminRouter.post('/settings/rate', adminAuth, adminController.updateUSDTSpread.bind(adminController));
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

// Static frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.resolve(__dirname, '../public')));

// Real-time streams (SSE)
const streamRouter = express.Router();

streamRouter.get('/balance', authenticate, async (req: any, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const userId = req.user?.id;
  if (!userId) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'Unauthorized' })}\n\n`);
    return res.end();
  }

  let closed = false;
  const interval = setInterval(async () => {
    if (closed) return;
    try {
      const balance = await walletService.getBalance(userId);
      res.write(`event: balance\ndata: ${JSON.stringify(balance)}\n\n`);
    } catch (e: any) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: e.message })}\n\n`);
    }
  }, 5000);

  req.on('close', () => {
    closed = true;
    clearInterval(interval);
  });
});

streamRouter.get('/orders', authenticate, async (req: any, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const userId = req.user?.id;
  if (!userId) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'Unauthorized' })}\n\n`);
    return res.end();
  }

  let closed = false;
  const interval = setInterval(async () => {
    if (closed) return;
    try {
      const orders = await exchangeService.getOrders(userId);
      res.write(`event: orders\ndata: ${JSON.stringify(orders)}\n\n`);
    } catch (e: any) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: e.message })}\n\n`);
    }
  }, 5000);

  req.on('close', () => {
    closed = true;
    clearInterval(interval);
  });
});

app.use('/api/stream', streamRouter);

// Initialize Workers & Start Server
const startServer = async () => {
  try {
    // 0. Load Configuration from DB
    await configService.loadConfig();
    console.log('✅ Configuration loaded from database');

    // 1. Start Persistent Workers (Start by default unless explicitly disabled)
    if (process.env.SKIP_WORKERS !== 'true') {
      await tronWorker.start();
      await bscService.startListening();
      payoutWorker.start();
      withdrawalWorker.start();
      console.log('✅ Background workers started');
    }

    // 2. Start Express Server
    server.listen(config.port, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${config.port} in ${config.nodeEnv} mode`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
