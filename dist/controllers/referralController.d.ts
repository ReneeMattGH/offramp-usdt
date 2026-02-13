import { Response } from 'express';
import { BaseController } from './baseController.js';
import { AuthRequest } from '../middleware/authMiddleware.js';
export declare class ReferralController extends BaseController {
    getStats(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
}
declare const _default: ReferralController;
export default _default;
