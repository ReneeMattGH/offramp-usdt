import { Response } from 'express';
import { BaseController } from './baseController.js';
import { AuthRequest } from '../middleware/authMiddleware.js';
export declare class ExchangeController extends BaseController {
    getRate(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    createOrder(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    getOrders(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
}
declare const _default: ExchangeController;
export default _default;
