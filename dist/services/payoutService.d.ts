export declare class PayoutService {
    private static instance;
    private provider;
    private constructor();
    static getInstance(): PayoutService;
    getOrders(userId: string): Promise<any[]>;
    handleWebhook(payload: any): Promise<void>;
    createPayout(userId: string, inrAmount: number, bankAccountId: string): Promise<void>;
}
declare const _default: PayoutService;
export default _default;
