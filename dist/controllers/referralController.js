import { BaseController } from './baseController.js';
import referralService from '../services/referralService.js';
export class ReferralController extends BaseController {
    async getStats(req, res) {
        try {
            if (!req.user)
                return this.unauthorized(res);
            const stats = await referralService.getReferralStats(req.user.id);
            return this.ok(res, stats);
        }
        catch (error) {
            return this.fail(res, error);
        }
    }
}
export default new ReferralController();
//# sourceMappingURL=referralController.js.map