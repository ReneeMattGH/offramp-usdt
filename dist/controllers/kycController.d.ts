import { Response } from 'express';
import { BaseController } from './baseController.js';
import { AuthRequest } from '../middleware/authMiddleware.js';
export declare class KycController extends BaseController {
    private static instance;
    private constructor();
    static getInstance(): KycController;
    submitKyc(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    getStatus(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
}
export declare const kycController: KycController;
