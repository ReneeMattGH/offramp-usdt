import { BaseController } from './baseController.js';
import walletService from '../services/walletService.js';
export class WalletController extends BaseController {
    async generateAddress(req, res) {
        try {
            if (!req.user)
                return this.unauthorized(res);
            const result = await walletService.generateDepositAddress(req.user.id);
            return this.ok(res, result);
        }
        catch (error) {
            return this.fail(res, error);
        }
    }
    async getBalance(req, res) {
        try {
            if (!req.user)
                return this.unauthorized(res);
            const balance = await walletService.getBalance(req.user.id);
            return this.ok(res, balance);
        }
        catch (error) {
            return this.fail(res, error);
        }
    }
}
export default new WalletController();
//# sourceMappingURL=walletController.js.map