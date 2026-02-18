import { Request, Response } from 'express';
import { BaseController } from './baseController.js';
import referralService from '../services/referralService.js';
import { AuthRequest } from '../middleware/authMiddleware.js';

export class ReferralController extends BaseController {
  async getStats(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return this.unauthorized(res);
      const stats = await referralService.getReferralStats(req.user.id);
      return this.ok(res, stats);
    } catch (error: any) {
      return this.fail(res, error);
    }
  }
}

export default new ReferralController();
