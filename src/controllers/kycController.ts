import { Request, Response } from 'express';
import { BaseController } from './baseController.js';
import { kycService } from '../services/kycService.js';

export class KycController extends BaseController {
  private static instance: KycController;

  private constructor() {
    super();
  }

  public static getInstance(): KycController {
    if (!KycController.instance) {
      KycController.instance = new KycController();
    }
    return KycController.instance;
  }

  async submitKyc(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const result = await kycService.submitKyc(
        userId,
        req.body,
        req.ip || null,
        req.file
      );
      return this.ok(res, result);
    } catch (err: any) {
      return this.clientError(res, err.message);
    }
  }

  async getStatus(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const status = await kycService.getKycStatus(userId);
      return this.ok(res, status);
    } catch (err: any) {
      return this.fail(res, err);
    }
  }
}

export const kycController = KycController.getInstance();
