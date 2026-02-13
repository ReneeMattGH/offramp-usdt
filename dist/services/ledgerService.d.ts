export declare class LedgerService {
    private static instance;
    private constructor();
    static getInstance(): LedgerService;
    ensureAccount(userId: string): Promise<void>;
    getWalletBalance(userId: string): Promise<{
        available: any;
        locked: any;
        is_consistent: any;
    }>;
    getLedgerHistory(userId: string, limit?: number): Promise<any[]>;
    creditDeposit(userId: string, amount: number, txHash: string, description?: string): Promise<boolean>;
    lockPayoutFunds(userId: string, amount: number, orderId: string): Promise<any>;
    finalizePayout(userId: string, amount: number, orderId: string): Promise<any>;
    failPayout(userId: string, amount: number, orderId: string): Promise<any>;
    lockFundsForExchange(userId: string, amount: number, exchangeId: string): Promise<boolean>;
    lockFundsForWithdrawal(userId: string, amount: number, withdrawalId: string): Promise<boolean>;
    finalizeWithdrawal(userId: string, amount: number, withdrawalId: string): Promise<boolean>;
    failWithdrawal(userId: string, amount: number, withdrawalId: string): Promise<boolean>;
    settleExchange(userId: string, amount: number, exchangeId: string): Promise<boolean>;
    refundExchange(userId: string, amount: number, exchangeId: string): Promise<boolean>;
}
declare const _default: LedgerService;
export default _default;
