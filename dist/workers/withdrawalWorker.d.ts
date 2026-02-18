export declare class WithdrawalWorker {
    private static instance;
    private isProcessing;
    private timer;
    private constructor();
    static getInstance(): WithdrawalWorker;
    start(): void;
    stop(): void;
    private processWithdrawals;
    private executeWithdrawal;
    private checkConfirmation;
}
declare const _default: WithdrawalWorker;
export default _default;
