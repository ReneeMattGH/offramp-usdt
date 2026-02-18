import { BaseController } from './baseController.js';
import adminService from '../services/adminService.js';
import { z } from 'zod';
const loginSchema = z.object({
    username: z.string(),
    password: z.string(),
});
const updateStatusSchema = z.object({
    status: z.string(),
    note: z.string().optional(),
});
const manualCreditSchema = z.object({
    userId: z.string(),
    amount: z.number(),
    txHash: z.string(),
});
const freezeSchema = z.object({
    frozen: z.boolean(),
});
export class AdminController extends BaseController {
    async login(req, res) {
        try {
            const parsed = loginSchema.safeParse(req.body);
            if (!parsed.success)
                return this.clientError(res, parsed.error.issues[0].message);
            const { username, password } = parsed.data;
            const result = await adminService.login(username, password);
            return this.ok(res, result);
        }
        catch (error) {
            return this.fail(res, error);
        }
    }
    async getDashboard(req, res) {
        try {
            const data = await adminService.getDashboardData();
            return this.ok(res, data);
        }
        catch (error) {
            return this.fail(res, error);
        }
    }
    async getKycList(req, res) {
        try {
            const data = await adminService.getKycList();
            return this.ok(res, data);
        }
        catch (error) {
            return this.fail(res, error);
        }
    }
    async approveKyc(req, res) {
        try {
            if (!req.admin)
                return this.unauthorized(res);
            const id = req.params.id;
            const result = await adminService.approveKyc(id, req.admin.id);
            return this.ok(res, result);
        }
        catch (error) {
            return this.fail(res, error);
        }
    }
    async rejectKyc(req, res) {
        try {
            if (!req.admin)
                return this.unauthorized(res);
            const id = req.params.id;
            const { reason } = req.body;
            const result = await adminService.rejectKyc(id, reason, req.admin.id);
            return this.ok(res, result);
        }
        catch (error) {
            return this.fail(res, error);
        }
    }
    async getDeposits(req, res) {
        try {
            const data = await adminService.getDeposits();
            return this.ok(res, data);
        }
        catch (error) {
            return this.fail(res, error);
        }
    }
    async approveDeposit(req, res) {
        try {
            if (!req.admin)
                return this.unauthorized(res);
            const txHash = req.params.txHash;
            const result = await adminService.approveDeposit(txHash, req.admin.id);
            return this.ok(res, result);
        }
        catch (error) {
            return this.fail(res, error);
        }
    }
    async manualCredit(req, res) {
        try {
            if (!req.admin)
                return this.unauthorized(res);
            const parsed = manualCreditSchema.safeParse(req.body);
            if (!parsed.success)
                return this.clientError(res, parsed.error.issues[0].message);
            const { userId, amount, txHash } = parsed.data;
            const result = await adminService.manualCredit(userId, amount, txHash, req.admin.id);
            return this.ok(res, result);
        }
        catch (error) {
            return this.fail(res, error);
        }
    }
    async getOrders(req, res) {
        try {
            const data = await adminService.getOrders();
            return this.ok(res, data);
        }
        catch (error) {
            return this.fail(res, error);
        }
    }
    async updateOrderStatus(req, res) {
        try {
            if (!req.admin)
                return this.unauthorized(res);
            const id = req.params.id;
            const parsed = updateStatusSchema.safeParse(req.body);
            if (!parsed.success)
                return this.clientError(res, parsed.error.issues[0].message);
            const { status, note } = parsed.data;
            const result = await adminService.updateOrderStatus(id, status, note || '', req.admin.id);
            return this.ok(res, result);
        }
        catch (error) {
            return this.fail(res, error);
        }
    }
    async getUsers(req, res) {
        try {
            const data = await adminService.getUsers();
            return this.ok(res, data);
        }
        catch (error) {
            return this.fail(res, error);
        }
    }
    async freezeUser(req, res) {
        try {
            if (!req.admin)
                return this.unauthorized(res);
            const id = req.params.id;
            const parsed = freezeSchema.safeParse(req.body);
            if (!parsed.success)
                return this.clientError(res, parsed.error.issues[0].message);
            const { frozen } = parsed.data;
            const result = await adminService.freezeUser(id, frozen, req.admin.id);
            return this.ok(res, result);
        }
        catch (error) {
            return this.fail(res, error);
        }
    }
    async getAuditLogs(req, res) {
        try {
            const data = await adminService.getAuditLogs();
            return this.ok(res, data);
        }
        catch (error) {
            return this.fail(res, error);
        }
    }
}
export default new AdminController();
//# sourceMappingURL=adminController.js.map