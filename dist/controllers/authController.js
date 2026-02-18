import { BaseController } from './baseController.js';
import authService from '../services/authService.js';
import { z } from 'zod';
const signupSchema = z.object({
    accountHolderName: z.string().min(2),
    accountNumber: z.string().min(8),
    ifscCode: z.string().length(11),
    otp: z.string().length(6),
    referralCode: z.string().optional(),
});
const loginSchema = z.object({
    accountNumber: z.string().min(8),
    otp: z.string().length(6),
});
const sendOtpSchema = z.object({
    accountNumber: z.string().min(8),
});
export class AuthController extends BaseController {
    async sendOTP(req, res) {
        try {
            const parsed = sendOtpSchema.safeParse(req.body);
            if (!parsed.success) {
                return this.clientError(res, 'Invalid account number');
            }
            await authService.sendOTP(parsed.data.accountNumber);
            return this.ok(res, { message: 'OTP sent successfully' });
        }
        catch (error) {
            return this.fail(res, error);
        }
    }
    async login(req, res) {
        try {
            const parsed = loginSchema.safeParse(req.body);
            if (!parsed.success) {
                return this.clientError(res, 'Invalid login data');
            }
            const result = await authService.login(parsed.data.accountNumber, parsed.data.otp);
            return this.ok(res, result);
        }
        catch (error) {
            if (error.message === 'Invalid OTP' || error.message === 'User not found. Please sign up.') {
                return this.clientError(res, error.message);
            }
            return this.fail(res, error);
        }
    }
    async signup(req, res) {
        try {
            const parsed = signupSchema.safeParse(req.body);
            if (!parsed.success) {
                return this.clientError(res, 'Invalid signup data');
            }
            const result = await authService.signup(parsed.data);
            return this.created(res, result);
        }
        catch (error) {
            if (error.message === 'Invalid OTP' || error.message === 'User already exists') {
                return this.clientError(res, error.message);
            }
            return this.fail(res, error);
        }
    }
}
export default new AuthController();
//# sourceMappingURL=authController.js.map