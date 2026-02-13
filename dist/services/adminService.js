import supabase from '../utils/supabase.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import tronService from './tronService.js';
import ledgerService from './ledgerService.js';
import walletService from './walletService.js';
import { decrypt } from '../utils/crypto.js';
export class AdminService {
    static instance;
    constructor() { }
    static getInstance() {
        if (!AdminService.instance) {
            AdminService.instance = new AdminService();
        }
        return AdminService.instance;
    }
    async login(username, password) {
        const { data: admin, error } = await supabase
            .from('admins')
            .select('*')
            .eq('username', username)
            .maybeSingle();
        if (error || !admin) {
            throw new Error('Invalid credentials');
        }
        const isValid = await bcrypt.compare(password, admin.password_hash);
        if (!isValid) {
            throw new Error('Invalid credentials');
        }
        const token = jwt.sign({ id: admin.id, username: admin.username, role: admin.role }, config.jwtSecret, { expiresIn: '8h' });
        return {
            token,
            admin: { id: admin.id, username: admin.username, role: admin.role }
        };
    }
    async getDashboardData() {
        const treasuryAddress = config.treasuryAddress;
        const treasuryBalance = await tronService.getTreasuryBalance(treasuryAddress);
        const [{ count: pendingKYC }, { count: pendingOrders }, { count: pendingWithdrawals }] = await Promise.all([
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
        if (error)
            throw error;
        return data;
    }
    async approveKyc(userId, adminId) {
        const { error } = await supabase.from('users').update({
            kyc_status: 'approved',
            kyc_verified_at: new Date().toISOString(),
            kyc_rejection_reason: null
        }).eq('id', userId);
        if (error)
            throw error;
        await this.logAction(adminId, 'KYC_APPROVE', 'user', userId);
        return { success: true };
    }
    async rejectKyc(userId, reason, adminId) {
        const { error } = await supabase.from('users').update({
            kyc_status: 'rejected',
            kyc_rejection_reason: reason || 'Admin Rejected'
        }).eq('id', userId);
        if (error)
            throw error;
        await this.logAction(adminId, 'KYC_REJECT', 'user', userId, { reason });
        return { success: true };
    }
    async getDeposits() {
        const { data, error } = await supabase
            .from('blockchain_transactions')
            .select('*, users(email, account_number)')
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        return data;
    }
    async approveDeposit(txHash, adminId) {
        const { data: tx } = await supabase.from('blockchain_transactions').select('*').eq('tx_hash', txHash).single();
        if (!tx)
            throw new Error('Transaction not found');
        if (tx.status === 'credited')
            throw new Error('Already credited');
        const success = await ledgerService.creditDeposit(tx.user_id, tx.amount, txHash, `Deposit ${tx.amount} USDT`);
        if (!success)
            throw new Error('Ledger credit failed');
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
                        walletService.sweepFunds(addrData.tron_address, privateKey, tx.amount, treasuryWallet.address).then(async (sweepTxHash) => {
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
        }
        catch (sweepError) {
            console.error('Sweep trigger failed:', sweepError);
        }
        await this.logAction(adminId, 'DEPOSIT_APPROVE', 'transaction', txHash, { amount: tx.amount });
        return { success: true };
    }
    async manualCredit(userId, amount, txHash, adminId) {
        const success = await ledgerService.creditDeposit(userId, amount, txHash, 'Manual Admin Credit');
        if (!success)
            throw new Error('Credit failed');
        await this.logAction(adminId, 'MANUAL_CREDIT', 'user', userId, { amount, txHash });
        return { success: true };
    }
    async getOrders() {
        const { data, error } = await supabase
            .from('exchange_orders')
            .select('*, users(email, account_number), bank_accounts(*)')
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        return data;
    }
    async updateOrderStatus(orderId, status, note, adminId) {
        const { data: order } = await supabase.from('exchange_orders').select('*').eq('id', orderId).single();
        if (!order)
            throw new Error('Order not found');
        if (status === 'approved') {
            await supabase.from('exchange_orders').update({ status: 'APPROVED', updated_at: new Date().toISOString() }).eq('id', orderId);
            await supabase.from('payout_orders').update({ status: 'APPROVED' }).eq('id', orderId);
        }
        else if (status === 'success') {
            await supabase.from('exchange_orders').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', orderId);
            await ledgerService.finalizePayout(order.user_id, order.usdt_amount, orderId);
        }
        else if (status === 'failed' || status === 'refunded') {
            await supabase.from('exchange_orders').update({ status: 'failed', failure_reason: note || 'Admin marked as failed' }).eq('id', orderId);
            await ledgerService.failPayout(order.user_id, order.usdt_amount, orderId);
        }
        await this.logAction(adminId, 'UPDATE_ORDER', 'order', orderId, { status, note });
        return { success: true };
    }
    async getUsers() {
        const { data, error } = await supabase
            .from('users')
            .select('*, ledger_accounts(available_balance, locked_balance)')
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        return data;
    }
    async freezeUser(userId, frozen, adminId) {
        const { error } = await supabase.from('users').update({ is_frozen: frozen }).eq('id', userId);
        if (error)
            throw error;
        await this.logAction(adminId, 'FREEZE_USER', 'user', userId, { frozen });
        return { success: true };
    }
    async getAuditLogs() {
        const { data, error } = await supabase
            .from('admin_audit_logs')
            .select('*, admins(username)')
            .order('created_at', { ascending: false })
            .limit(200);
        if (error)
            throw error;
        return data;
    }
    async logAction(adminId, action, targetType, targetId, details = {}, ip = '') {
        try {
            await supabase.from('admin_audit_logs').insert({
                admin_id: adminId,
                action,
                target_type: targetType,
                target_id: targetId,
                details,
                ip_address: ip
            });
        }
        catch (err) {
            console.error('Audit log failed:', err);
        }
    }
}
export default AdminService.getInstance();
//# sourceMappingURL=adminService.js.map