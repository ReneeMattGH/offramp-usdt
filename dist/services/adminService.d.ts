export declare class AdminService {
    private static instance;
    private constructor();
    static getInstance(): AdminService;
    login(username: string, password: string): Promise<{
        token: string;
        admin: {
            id: any;
            username: any;
            role: any;
        };
    }>;
    getDashboardData(): Promise<{
        treasury: {
            trx: string | import("bignumber.js/bignumber.js").BigNumber;
            usdt: number;
            address: string;
        } | {
            trx: number;
            usdt: number;
            address: string;
        };
        stats: {
            pendingKYC: number;
            pendingOrders: number;
            pendingWithdrawals: number;
        };
    }>;
    getKycList(): Promise<any[]>;
    approveKyc(userId: string, adminId: string): Promise<{
        success: boolean;
    }>;
    rejectKyc(userId: string, reason: string, adminId: string): Promise<{
        success: boolean;
    }>;
    getDeposits(): Promise<any[]>;
    approveDeposit(txHash: string, adminId: string): Promise<{
        success: boolean;
    }>;
    manualCredit(userId: string, amount: number, txHash: string, adminId: string): Promise<{
        success: boolean;
    }>;
    getOrders(): Promise<any[]>;
    updateOrderStatus(orderId: string, status: string, note: string, adminId: string): Promise<{
        success: boolean;
    }>;
    getUsers(): Promise<any[]>;
    freezeUser(userId: string, frozen: boolean, adminId: string): Promise<{
        success: boolean;
    }>;
    getAuditLogs(): Promise<any[]>;
    logAction(adminId: string, action: string, targetType: string, targetId: string, details?: any, ip?: string): Promise<void>;
}
declare const _default: AdminService;
export default _default;
