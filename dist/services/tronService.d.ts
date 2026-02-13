export declare class TronService {
    private static instance;
    private constructor();
    static getInstance(): TronService;
    sendUSDT(toAddress: string, amount: number): Promise<string | null>;
    checkConfirmation(txHash: string): Promise<'confirmed' | 'failed' | 'pending'>;
    getTreasuryBalance(address: string): Promise<{
        trx: string | import("tronweb").BigNumber;
        usdt: number;
    } | {
        trx: number;
        usdt: number;
    }>;
}
declare const _default: TronService;
export default _default;
