import { Request, Response } from 'express';
import { BaseController } from './baseController.js';
export declare class WebhookController extends BaseController {
    handleRazorpay(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
declare const _default: WebhookController;
export default _default;
