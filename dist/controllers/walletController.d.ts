import { Response } from 'express';
import { BaseController } from './baseController.js';
import { AuthRequest } from '../middleware/authMiddleware.js';
export declare class WalletController extends BaseController {
    generateAddress(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    getBalance(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
}
declare const _default: WalletController;
export default _default;
