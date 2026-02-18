export declare class TronWorker {
    private static instance;
    private isProcessing;
    private timer;
    private constructor();
    static getInstance(): TronWorker;
    start(): void;
    stop(): void;
    private checkDeposits;
    private processAddress;
}
declare const _default: TronWorker;
export default _default;
