import { Response } from 'express';
import { BaseController } from './baseController.js';
import bankService from '../services/bankService.js';
import { AuthRequest } from '../middleware/authMiddleware.js';

export class BankAccountController extends BaseController {
  async addAccount(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return this.unauthorized(res);

      const { account_number, ifsc_code, account_holder_name, bank_name, is_primary } = req.body;

      if (!account_number || !ifsc_code || !account_holder_name || !bank_name) {
        return this.clientError(res, 'Missing required fields: account_number, ifsc_code, account_holder_name, bank_name');
      }

      const account = await bankService.addBankAccount(req.user.id, {
        account_number,
        ifsc_code,
        account_holder_name,
        bank_name,
        is_primary
      });

      return this.ok(res, account);
    } catch (error: any) {
      return this.fail(res, error.message);
    }
  }

  async listMyAccounts(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return this.unauthorized(res);

      const accounts = await bankService.listUserBankAccounts(req.user.id);
      return this.ok(res, accounts);
    } catch (error: any) {
      return this.fail(res, error.message);
    }
  }

  async deleteAccount(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return this.unauthorized(res);

      const id = req.params.id as string;
      if (!id) return this.clientError(res, 'Missing bank account id');

      // Pass userId so only the owner can delete their own account
      await bankService.deleteBankAccount(id, req.user.id);
      return this.ok(res, { success: true, message: 'Bank account deleted' });
    } catch (error: any) {
      return this.fail(res, error.message);
    }
  }

  // Admin APIs
  async adminListAllAccounts(req: any, res: Response) {
    try {
      const accounts = await bankService.listAllBankAccounts();
      return this.ok(res, accounts);
    } catch (error: any) {
      return this.fail(res, error.message);
    }
  }

  async adminUpdateAccount(req: any, res: Response) {
    try {
      const { id } = req.params;
      const data = req.body;

      const updated = await bankService.updateBankAccount(id, data);
      return this.ok(res, updated);
    } catch (error: any) {
      return this.fail(res, error.message);
    }
  }

  async adminDeleteAccount(req: any, res: Response) {
    try {
      const { id } = req.params;
      await bankService.deleteBankAccount(id);
      return this.ok(res, { success: true, message: 'Bank account deleted (soft-delete)' });
    } catch (error: any) {
      return this.fail(res, error.message);
    }
  }
}

export default new BankAccountController();
