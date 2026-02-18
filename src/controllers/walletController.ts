import { Request, Response } from 'express';
import { BaseController } from './baseController.js';
import walletService from '../services/walletService.js';
import { AuthRequest } from '../middleware/authMiddleware.js';

export class WalletController extends BaseController {
  async generateAddress(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return this.unauthorized(res);
      
      const result = await walletService.generateDepositAddress(req.user.id);
      return this.ok(res, result);
    } catch (error: any) {
      return this.fail(res, error);
    }
  }

  async getBalance(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return this.unauthorized(res);

      const balance = await walletService.getBalance(req.user.id);
      return this.ok(res, balance);
    } catch (error: any) {
      return this.fail(res, error);
    }
  }
}

export default new WalletController();
