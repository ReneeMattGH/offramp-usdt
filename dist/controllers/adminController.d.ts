import { Request, Response } from 'express';
import { BaseController } from './baseController.js';
export interface AdminRequest extends Request {
    admin?: {
        id: string;
        username: string;
        role: string;
    };
}
export declare class AdminController extends BaseController {
    login(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    getDashboard(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    getKycList(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    approveKyc(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    rejectKyc(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    getDeposits(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    approveDeposit(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    manualCredit(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    getOrders(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    updateOrderStatus(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    getUsers(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    freezeUser(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    getAuditLogs(req: AdminRequest, res: Response): Promise<Response<any, Record<string, any>>>;
}
declare const _default: AdminController;
export default _default;
