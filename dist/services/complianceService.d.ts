export declare class ComplianceService {
    private static instance;
    private fallbackLimits;
    private constructor();
    static getInstance(): ComplianceService;
    private getLimit;
    isPaused(type: 'deposits' | 'exchanges' | 'withdrawals' | 'usdt_withdrawals'): boolean;
    checkUSDTWithdrawalLimit(userId: string, amount: number): Promise<boolean>;
    checkExchangeLimit(userId: string, amount: number): Promise<boolean>;
    checkWithdrawalLimit(userId: string, amount: number): Promise<boolean>;
}
declare const _default: ComplianceService;
export default _default;
