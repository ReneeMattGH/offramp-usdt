import supabase from '../utils/supabase.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import tronService from './tronService.js';

import ledgerService from './ledgerService.js';
import configService from './configService.js';
import { v4 as uuidv4 } from 'uuid';
import walletService from './walletService.js';
import { decrypt } from '../utils/crypto.js';

export class AdminService {
  private static instance: AdminService;

  private constructor() {}

  public static getInstance(): AdminService {
    if (!AdminService.instance) {
      AdminService.instance = new AdminService();
    }
    return AdminService.instance;
  }

  async login(username: string, password: string) {
    try {
      const { data: admin, error } = await supabase
        .from('admins')
        .select('*')
        .eq('username', username)
        .maybeSingle();
      
      if (error) {
        console.error('Supabase error during admin login:', error);
        throw new Error('Database connection error');
      }
      
      if (!admin) {
        throw new Error('Invalid credentials');
      }

      const isValid = await bcrypt.compare(password, admin.password_hash);
      if (!isValid) {
        // Log if it's not a bcrypt hash to help debug
        if (!admin.password_hash.startsWith('$2')) {
          console.warn(`Admin ${username} has an unhashed password. Please update it using bcrypt.`);
        }
        throw new Error('Invalid credentials');
      }

      const token = jwt.sign(
        { id: admin.id, username: admin.username, role: admin.role },
        config.jwtSecret,
        { expiresIn: '8h' }
      );

      return {
        token,
        admin: { id: admin.id, username: admin.username, role: admin.role }
      };
    } catch (err: any) {
      console.error(`Admin login failed for ${username}:`, err.message);
      throw err;
    }
  }

  async getAdminMe(adminId: string) {
    const { data, error } = await supabase
      .from('admins')
      .select('id, username, role')
      .eq('id', adminId)
      .single();
    if (error) throw error;
    return data;
  }

  async updateAdminCredentials(adminId: string, username?: string, password?: string) {
    const updates: any = {};
    if (username) updates.username = username;
    if (password) {
      updates.password_hash = await bcrypt.hash(password, 10);
    }
    
    if (Object.keys(updates).length === 0) return { success: false, message: 'No updates provided' };

    const { data, error } = await supabase
      .from('admins')
      .update(updates)
      .eq('id', adminId)
      .select('id, username, role')
      .single();

    if (error) throw error;
    await this.logAction(adminId, 'UPDATE_CREDENTIALS', 'admin', adminId, { updatedFields: Object.keys(updates) });
    return { success: true, admin: data };
  }

  async createAdmin(username: string, password: string, role: string, requesterAdminId: string) {
    // Check requester role
    const { data: requester } = await supabase
      .from('admins')
      .select('role')
      .eq('id', requesterAdminId)
      .single();
    
    if (!requester || requester.role !== 'superadmin') {
      throw new Error('Unauthorized: Only super admins can create new admins');
    }

    const password_hash = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from('admins')
      .insert({
        id: uuidv4(),
        username,
        password_hash,
        role: role || 'admin',
        created_at: new Date().toISOString()
      })
      .select('id, username, role')
      .single();

    if (error) {
      if (error.code === '23505') throw new Error('Username already exists');
      throw error;
    }

    await this.logAction(requesterAdminId, 'CREATE_ADMIN', 'admin', data.id, { username, role });
    return { success: true, admin: data };
  }

  async listAdmins(requesterAdminId: string) {
    const { data: requester } = await supabase
      .from('admins')
      .select('role')
      .eq('id', requesterAdminId)
      .single();
    
    if (!requester || requester.role !== 'superadmin') {
      throw new Error('Permission denied');
    }

    const { data, error } = await supabase
      .from('admins')
      .select('id, username, role, created_at')
      .neq('id', requesterAdminId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  }

  async updateOtherAdmin(requesterAdminId: string, targetAdminId: string, updates: { username?: string, password?: string }) {
    const { data: requester } = await supabase
      .from('admins')
      .select('role')
      .eq('id', requesterAdminId)
      .single();
    
    if (!requester || requester.role !== 'superadmin') {
      throw new Error('Permission denied');
    }

    const updatePayload: any = {};
    if (updates.username) updatePayload.username = updates.username;
    if (updates.password) {
      updatePayload.password_hash = await bcrypt.hash(updates.password, 10);
    }

    if (Object.keys(updatePayload).length === 0) throw new Error('No updates provided');

    const { data, error } = await supabase
      .from('admins')
      .update(updatePayload)
      .eq('id', targetAdminId)
      .select('id, username, role')
      .single();
    
    if (error) throw error;
    await this.logAction(requesterAdminId, 'SUPERADMIN_UPDATE_ADMIN', 'admin', targetAdminId, { fields: Object.keys(updatePayload) });
    return { success: true, admin: data };
  }

  async deleteAdmin(requesterAdminId: string, targetAdminId: string) {
    const { data: requester } = await supabase
      .from('admins')
      .select('role')
      .eq('id', requesterAdminId)
      .single();
    
    if (!requester || requester.role !== 'superadmin') {
      throw new Error('Permission denied');
    }

    const { error } = await supabase
      .from('admins')
      .delete()
      .eq('id', targetAdminId);
    
    if (error) throw error;
    await this.logAction(requesterAdminId, 'SUPERADMIN_DELETE_ADMIN', 'admin', targetAdminId);
    return { success: true };
  }

  async getDashboardData() {
    const treasuryAddress = config.treasuryAddress;
    const treasuryBalance = await tronService.getTreasuryBalance(treasuryAddress);

    const [
      { count: pendingKYC },
      { count: pendingOrders },
      { count: pendingWithdrawals }
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('kyc_status', 'pending'),
      supabase.from('exchange_orders').select('*', { count: 'exact', head: true }).eq('status', 'processing'),
      supabase.from('usdt_withdrawals').select('*', { count: 'exact', head: true }).eq('status', 'pending')
    ]);

    return {
      treasury: {
        address: treasuryAddress,
        ...treasuryBalance
      },
      stats: {
        pendingKYC: pendingKYC || 0,
        pendingOrders: pendingOrders || 0,
        pendingWithdrawals: pendingWithdrawals || 0
      }
    };
  }

  async getKycList() {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .neq('kyc_status', 'not_submitted')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async approveKyc(userId: string, adminId: string) {
    const { error } = await supabase.from('users').update({
      kyc_status: 'approved',
      kyc_verified_at: new Date().toISOString(),
      kyc_rejection_reason: null
    }).eq('id', userId);
    if (error) throw error;
    await this.logAction(adminId, 'KYC_APPROVE', 'user', userId);
    return { success: true };
  }

  async rejectKyc(userId: string, reason: string, adminId: string) {
    const { error } = await supabase.from('users').update({
      kyc_status: 'rejected',
      kyc_rejection_reason: reason || 'Admin Rejected'
    }).eq('id', userId);
    if (error) throw error;
    await this.logAction(adminId, 'KYC_REJECT', 'user', userId, { reason });
    return { success: true };
  }

  async getDeposits() {
    const { data, error } = await supabase
      .from('blockchain_transactions')
      .select('*, users(email, account_number)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async approveDeposit(txHash: string, adminId: string) {
    const { data: tx } = await supabase.from('blockchain_transactions').select('*').eq('tx_hash', txHash).single();
    if (!tx) throw new Error('Transaction not found');
    if (tx.status === 'credited') throw new Error('Already credited');

    const success = await ledgerService.creditDeposit(tx.user_id, tx.amount, txHash, `Deposit ${tx.amount} USDT`);
    if (!success) throw new Error('Ledger credit failed');

    await supabase.from('blockchain_transactions').update({ 
      status: 'credited', 
      processed_at: new Date().toISOString() 
    }).eq('tx_hash', txHash);

    const { data: addr } = await supabase.from('deposit_addresses').select('id').eq('tron_address', tx.to_address).maybeSingle();
    if (addr) {
      await supabase.from('deposit_addresses').update({ is_used: true }).eq('id', addr.id);
    }

    // Trigger Sweep
    try {
      const { data: addrData } = await supabase
        .from('deposit_addresses')
        .select('*')
        .eq('tron_address', tx.to_address)
        .single();

      if (addrData) {
        const treasuryWallet = await walletService.getWallet('treasury');
        if (treasuryWallet) {
          const privateKey = decrypt(addrData.private_key_encrypted);
          if (privateKey) {
            walletService.sweepFunds(
              addrData.tron_address, 
              privateKey, 
              tx.amount, 
              treasuryWallet.address
            ).then(async (sweepTxHash: string | null) => {
              if (sweepTxHash) {
                await supabase.from('blockchain_transactions').update({ 
                  sweep_tx_hash: sweepTxHash,
                  swept_at: new Date().toISOString()
                }).eq('tx_hash', txHash);
              }
            });
          }
        }
      }
    } catch (sweepError) {
      console.error('Sweep trigger failed:', sweepError);
    }

    await this.logAction(adminId, 'DEPOSIT_APPROVE', 'transaction', txHash, { amount: tx.amount });
    return { success: true };
  }

  async manualCredit(userId: string, amount: number, txHash: string, adminId: string) {
    const { data, error } = await supabase.rpc('credit_deposit', {
      p_user_id: userId,
      p_amount: amount,
      p_tx_hash: txHash,
      p_description: `Manual Credit by Admin (${adminId})`
    });
    
    if (error) throw error;
    if (!data.success) throw new Error(data.message);
    
    await this.logAction(adminId, 'MANUAL_CREDIT', 'ledger_accounts', userId, { amount, txHash });
    return { success: true, balance: data.new_balance };
  }

  async freezeAccount(userId: string, frozen: boolean, adminId: string) {
    const { error } = await supabase
      .from('users')
      .update({ is_frozen: frozen, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw error;
    
    await this.logAction(adminId, frozen ? 'FREEZE_USER' : 'UNFREEZE_USER', 'users', userId);
    return { success: true };
  }

  async getOrders() {
    const { data, error } = await supabase
      .from('exchange_orders')
      .select('*, users(email, account_number), bank_accounts(*)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async updateOrderStatus(orderId: string, status: string, note: string, adminId: string) {
    const { data: order } = await supabase.from('exchange_orders').select('*').eq('id', orderId).single();
    if (!order) throw new Error('Order not found');

    const normalizedStatus = status.toUpperCase();

    if (normalizedStatus === 'APPROVED') {
      await supabase.from('exchange_orders').update({ status: 'APPROVED', updated_at: new Date().toISOString() }).eq('id', orderId);
      await supabase.from('payout_orders').update({ status: 'APPROVED' }).eq('id', orderId);
    } else if (normalizedStatus === 'SUCCESS') {
      // Handle success...
    }
    // ... rest of the method ...
    await this.logAction(adminId, 'UPDATE_ORDER_STATUS', 'order', orderId, { status: normalizedStatus, note });
    return { success: true };
  }

  async updateSystemSpread(spreadPercent: number, adminId: string) {
    const { error } = await supabase
      .from('system_settings')
      .update({ exchange_spread_percent: spreadPercent })
      .eq('id', 1);

    if (error) throw error;
    
    // Also update local cache
    await configService.loadConfig();

    await this.logAction(adminId, 'UPDATE_SPREAD', 'system_settings', 'exchange_spread_percent', { spreadPercent });
    return { success: true };
  }

  async getUsers() {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async freezeUser(userId: string, frozen: boolean, adminId: string) {
    return this.freezeAccount(userId, frozen, adminId);
  }

  async getAuditLogs() {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*, users(email)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  private async logAction(adminId: string, action: string, entityType: string, entityId: string, metadata: any = {}) {
    await supabase.from('audit_logs').insert({
      user_id: adminId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      new_values: metadata,
      created_at: new Date().toISOString()
    });
  }
}

export default AdminService.getInstance();
