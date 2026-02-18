import { Response, NextFunction } from 'express';
import { AdminRequest } from '../controllers/adminController.js';
export declare const adminAuth: (req: AdminRequest, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
