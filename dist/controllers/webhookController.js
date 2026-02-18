import crypto from 'crypto';
import config from '../config/index.js';
import payoutService from '../services/payoutService.js';
import { BaseController } from './baseController.js';
export class WebhookController extends BaseController {
    async handleRazorpay(req, res) {
        try {
            const secret = config.razorpay.webhookSecret;
            if (secret) {
                const signature = req.headers['x-razorpay-signature'];
                const expectedSignature = crypto
                    .createHmac('sha256', secret)
                    .update(JSON.stringify(req.body))
                    .digest('hex');
                if (signature !== expectedSignature) {
                    return res.status(400).send('Invalid signature');
                }
            }
            await payoutService.handleWebhook(req.body);
            return res.json({ status: 'ok' });
        }
        catch (error) {
            console.error('[WEBHOOK_CONTROLLER] Razorpay error:', error.message);
            return this.fail(res, error);
        }
    }
}
export default new WebhookController();
//# sourceMappingURL=webhookController.js.map