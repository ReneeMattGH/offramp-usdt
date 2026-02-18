export declare class PayoutWorker {
    private static instance;
    private isProcessing;
    private timer;
    private provider;
    private constructor();
    static getInstance(): PayoutWorker;
    start(): void;
    stop(): void;
    private processQueue;
}
declare const _default: PayoutWorker;
export default _default;
