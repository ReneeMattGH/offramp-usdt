import { Request, Response } from 'express';
import { BaseController } from './baseController.js';
export declare class KycController extends BaseController {
    private static instance;
    private constructor();
    static getInstance(): KycController;
    submitKyc(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    getStatus(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
export declare const kycController: KycController;
