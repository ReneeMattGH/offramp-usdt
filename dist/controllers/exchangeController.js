import { BaseController } from './baseController.js';
import exchangeService from '../services/exchangeService.js';
import { z } from 'zod';
const createOrderSchema = z.object({
    usdtAmount: z.number().positive(),
    bankAccountId: z.string().uuid().optional(),
    bankDetails: z.object({
        account_number: z.string(),
        ifsc: z.string(),
        account_holder_name: z.string()
    }).optional()
});
export class ExchangeController extends BaseController {
    async getRate(req, res) {
        try {
            const rate = await exchangeService.getLiveRate();
            return this.ok(res, { rate });
        }
        catch (error) {
            return this.fail(res, error);
        }
    }
    async createOrder(req, res) {
        try {
            if (!req.user)
                return this.unauthorized(res);
            const parsed = createOrderSchema.safeParse(req.body);
            if (!parsed.success) {
                return this.clientError(res, 'Invalid order data');
            }
            const result = await exchangeService.createExchangeOrder(req.user.id, parsed.data.usdtAmount, parsed.data.bankAccountId, parsed.data.bankDetails);
            return this.created(res, result);
        }
        catch (error) {
            return this.clientError(res, error.message);
        }
    }
    async getOrders(req, res) {
        try {
            if (!req.user)
                return this.unauthorized(res);
            const orders = await exchangeService.getOrders(req.user.id);
            return this.ok(res, orders);
        }
        catch (error) {
            return this.fail(res, error);
        }
    }
}
export default new ExchangeController();
//# sourceMappingURL=exchangeController.js.map