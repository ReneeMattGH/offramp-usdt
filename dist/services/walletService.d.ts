export declare class WalletService {
    private static instance;
    private constructor();
    static getInstance(): WalletService;
    generateDepositAddress(userId: string): Promise<{
        userId: string;
        tronAddress: any;
        expiresAt: string;
    }>;
    getBalance(userId: string): Promise<{
        available_balance: any;
        locked_balance: any;
    }>;
    getWallet(type: string): Promise<any>;
    sweepFunds(fromAddress: string, privateKey: string, amount: number, toAddress: string): Promise<string | null>;
}
declare const _default: WalletService;
export default _default;
