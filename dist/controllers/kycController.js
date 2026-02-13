import { BaseController } from './baseController.js';
import { kycService } from '../services/kycService.js';
export class KycController extends BaseController {
    static instance;
    constructor() {
        super();
    }
    static getInstance() {
        if (!KycController.instance) {
            KycController.instance = new KycController();
        }
        return KycController.instance;
    }
    async submitKyc(req, res) {
        try {
            const userId = req.user.id;
            const result = await kycService.submitKyc(userId, req.body, req.ip || null, req.file);
            return this.ok(res, result);
        }
        catch (err) {
            return this.clientError(res, err.message);
        }
    }
    async getStatus(req, res) {
        try {
            const userId = req.user.id;
            const status = await kycService.getKycStatus(userId);
            return this.ok(res, status);
        }
        catch (err) {
            return this.fail(res, err);
        }
    }
}
export const kycController = KycController.getInstance();
//# sourceMappingURL=kycController.js.map