import { Request, Response } from 'express';
import { BaseController } from './baseController.js';
export declare class AuthController extends BaseController {
    sendOTP(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    login(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    signup(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
declare const _default: AuthController;
export default _default;
