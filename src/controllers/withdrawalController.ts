import { Response } from 'express';
import { BaseController } from './baseController.js';
import withdrawalService from '../services/withdrawalService.js';
import { AuthRequest } from '../middleware/authMiddleware.js';
import { TronWeb } from 'tronweb';

export class WithdrawalController extends BaseController {
  async requestWithdrawal(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return this.unauthorized(res);
      
      const { destination_address, usdt_amount } = req.body;
      
      if (!destination_address || !usdt_amount) {
        return this.clientError(res, 'Missing destination_address or usdt_amount');
      }

      // Validate Tron address
      if (!TronWeb.isAddress(destination_address)) {
        return this.clientError(res, 'Invalid Tron address');
      }

      const withdrawal = await withdrawalService.requestUSDTWithdrawal(req.user.id, {
        destination_address,
        usdt_amount: Number(usdt_amount)
      });

      return this.ok(res, withdrawal);
    } catch (error: any) {
      return this.fail(res, error.message);
    }
  }

  async getMyWithdrawals(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return this.unauthorized(res);

      const history = await withdrawalService.getWithdrawalHistory(req.user.id);
      return this.ok(res, history);
    } catch (error: any) {
      return this.fail(res, error.message);
    }
  }

  // Admin APIs
  async adminListAll(req: any, res: Response) {
    try {
      const withdrawals = await withdrawalService.listAllWithdrawals();
      return this.ok(res, withdrawals);
    } catch (error: any) {
      return this.fail(res, error.message);
    }
  }

  async adminProcess(req: any, res: Response) {
    try {
      const { id } = req.params;
      const { tx_hash } = req.body;
      
      if (!tx_hash) return this.clientError(res, 'Transaction hash required');

      await withdrawalService.processWithdrawal(id, tx_hash);
      return this.ok(res, { success: true, message: 'Withdrawal processed' });
    } catch (error: any) {
      return this.fail(res, error.message);
    }
  }

  async adminReject(req: any, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      
      if (!reason) return this.clientError(res, 'Rejection reason required');

      await withdrawalService.rejectWithdrawal(id, reason);
      return this.ok(res, { success: true, message: 'Withdrawal rejected and funds refunded' });
    } catch (error: any) {
      return this.fail(res, error.message);
    }
  }
}

export default new WithdrawalController();
