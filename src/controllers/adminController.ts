import { Request, Response } from 'express';
import { BaseController } from './baseController.js';
import adminService from '../services/adminService.js';
import { z } from 'zod';

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

const updateStatusSchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'APPROVED', 'SUCCESS', 'FAILED', 'REFUNDED']),
  note: z.string().optional(),
});

const updateRateSchema = z.object({
  spreadPercent: z.number().min(-100).max(100),
});

const manualCreditSchema = z.object({
  userId: z.string(),
  amount: z.number(),
  txHash: z.string(),
});

const freezeSchema = z.object({
  frozen: z.boolean(),
});

const updateAdminSchema = z.object({
  username: z.string().optional(),
  password: z.string().min(6).optional(),
});

const addAdminSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  role: z.enum(['superadmin', 'admin', 'staff']).default('admin'),
});

export interface AdminRequest extends Request {
  admin?: {
    id: string;
    username: string;
    role: string;
  };
}

export class AdminController extends BaseController {
  async login(req: Request, res: Response) {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) return this.clientError(res, parsed.error.issues[0].message);
      const { username, password } = parsed.data;
      const result = await adminService.login(username, password);
      return this.ok(res, result);
    } catch (error: any) {
      return this.fail(res, error.message || error);
    }
  }

  async me(req: AdminRequest, res: Response) {
    try {
      if (!req.admin) return this.unauthorized(res);
      const data = await adminService.getAdminMe(req.admin.id);
      return this.ok(res, data);
    } catch (error: any) {
      return this.fail(res, error.message || error);
    }
  }

  async updateMyCredentials(req: AdminRequest, res: Response) {
    try {
      if (!req.admin) return this.unauthorized(res);
      const parsed = updateAdminSchema.safeParse(req.body);
      if (!parsed.success) return this.clientError(res, parsed.error.issues[0].message);
      
      const { username, password } = parsed.data;
      const result = await adminService.updateAdminCredentials(req.admin.id, username, password);
      return this.ok(res, result);
    } catch (error: any) {
      return this.fail(res, error.message || error);
    }
  }

  async addAdmin(req: AdminRequest, res: Response) {
    try {
      if (!req.admin) return this.unauthorized(res);
      const parsed = addAdminSchema.safeParse(req.body);
      if (!parsed.success) return this.clientError(res, parsed.error.issues[0].message);

      const { username, password, role } = parsed.data;
      const result = await adminService.createAdmin(username, password, role, req.admin.id);
      return this.ok(res, result);
    } catch (error: any) {
      return this.fail(res, error.message || error);
    }
  }

  async listAllAdmins(req: AdminRequest, res: Response) {
    try {
      if (!req.admin) return this.unauthorized(res);
      const data = await adminService.listAdmins(req.admin.id);
      return this.ok(res, data);
    } catch (error: any) {
      return this.fail(res, error.message || error);
    }
  }

  async updateOtherAdmin(req: AdminRequest, res: Response) {
    try {
      if (!req.admin) return this.unauthorized(res);
      const id = req.params.id as string;
      const parsed = updateAdminSchema.safeParse(req.body);
      if (!parsed.success) return this.clientError(res, parsed.error.issues[0].message);

      const result = await adminService.updateOtherAdmin(req.admin.id, id, parsed.data);
      return this.ok(res, result);
    } catch (error: any) {
      return this.fail(res, error.message || error);
    }
  }

  async deleteOtherAdmin(req: AdminRequest, res: Response) {
    try {
      if (!req.admin) return this.unauthorized(res);
      const id = req.params.id as string;
      const result = await adminService.deleteAdmin(req.admin.id, id);
      return this.ok(res, result);
    } catch (error: any) {
      return this.fail(res, error.message || error);
    }
  }

  async getDashboard(req: AdminRequest, res: Response) {
    try {
      const data = await adminService.getDashboardData();
      return this.ok(res, data);
    } catch (error: any) {
      return this.fail(res, error);
    }
  }

  async getKycList(req: AdminRequest, res: Response) {
    try {
      const data = await adminService.getKycList();
      return this.ok(res, data);
    } catch (error: any) {
      return this.fail(res, error);
    }
  }

  async approveKyc(req: AdminRequest, res: Response) {
    try {
      if (!req.admin) return this.unauthorized(res);
      const id = req.params.id as string;
      const result = await adminService.approveKyc(id, req.admin.id);
      return this.ok(res, result);
    } catch (error: any) {
      return this.fail(res, error);
    }
  }

  async rejectKyc(req: AdminRequest, res: Response) {
    try {
      if (!req.admin) return this.unauthorized(res);
      const id = req.params.id as string;
      const { reason } = req.body;
      const result = await adminService.rejectKyc(id, reason, req.admin.id);
      return this.ok(res, result);
    } catch (error: any) {
      return this.fail(res, error);
    }
  }

  async getDeposits(req: AdminRequest, res: Response) {
    try {
      const data = await adminService.getDeposits();
      return this.ok(res, data);
    } catch (error: any) {
      return this.fail(res, error);
    }
  }

  async approveDeposit(req: AdminRequest, res: Response) {
    try {
      if (!req.admin) return this.unauthorized(res);
      const txHash = req.params.txHash as string;
      const result = await adminService.approveDeposit(txHash, req.admin.id);
      return this.ok(res, result);
    } catch (error: any) {
      return this.fail(res, error);
    }
  }

  async manualCredit(req: AdminRequest, res: Response) {
    try {
      if (!req.admin) return this.unauthorized(res);
      const parsed = manualCreditSchema.safeParse(req.body);
      if (!parsed.success) return this.clientError(res, parsed.error.issues[0].message);
      const { userId, amount, txHash } = parsed.data;
      const result = await adminService.manualCredit(userId, amount, txHash, req.admin.id);
      return this.ok(res, result);
    } catch (error: any) {
      return this.fail(res, error);
    }
  }

  async getOrders(req: AdminRequest, res: Response) {
    try {
      const data = await adminService.getOrders();
      return this.ok(res, data);
    } catch (error: any) {
      return this.fail(res, error);
    }
  }

  async updateOrderStatus(req: AdminRequest, res: Response) {
    try {
      if (!req.admin) return this.unauthorized(res);
      const id = req.params.id as string;
      const parsed = updateStatusSchema.safeParse(req.body);
      if (!parsed.success) return this.clientError(res, parsed.error.issues[0].message);
      const { status, note } = parsed.data;
      const result = await adminService.updateOrderStatus(id, status, note || '', req.admin.id);
      return this.ok(res, result);
    } catch (error: any) {
      return this.fail(res, error);
    }
  }

  async updateUSDTSpread(req: AdminRequest, res: Response) {
    try {
      if (!req.admin) return this.unauthorized(res);
      const parsed = updateRateSchema.safeParse(req.body);
      if (!parsed.success) return this.clientError(res, parsed.error.issues[0].message);
      
      const { spreadPercent } = parsed.data;
      const result = await adminService.updateSystemSpread(spreadPercent, req.admin.id);
      return this.ok(res, result);
    } catch (error: any) {
      return this.fail(res, error);
    }
  }

  async getUsers(req: AdminRequest, res: Response) {
    try {
      const data = await adminService.getUsers();
      return this.ok(res, data);
    } catch (error: any) {
      return this.fail(res, error);
    }
  }

  async freezeUser(req: AdminRequest, res: Response) {
    try {
      if (!req.admin) return this.unauthorized(res);
      const id = req.params.id as string;
      const parsed = freezeSchema.safeParse(req.body);
      if (!parsed.success) return this.clientError(res, parsed.error.issues[0].message);
      const { frozen } = parsed.data;
      const result = await adminService.freezeUser(id, frozen, req.admin.id);
      return this.ok(res, result);
    } catch (error: any) {
      return this.fail(res, error);
    }
  }

  async getAuditLogs(req: AdminRequest, res: Response) {
    try {
      const data = await adminService.getAuditLogs();
      return this.ok(res, data);
    } catch (error: any) {
      return this.fail(res, error);
    }
  }
}

export default new AdminController();
