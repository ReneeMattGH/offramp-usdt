export declare class ExchangeService {
    private static instance;
    private cachedRate;
    private constructor();
    static getInstance(): ExchangeService;
    getLiveRate(): Promise<number>;
    createExchangeOrder(userId: string, usdtAmount: number, bankAccountId?: string, bankDetails?: any): Promise<{
        success: boolean;
        orderId: any;
        inrAmount: number;
        rate: number;
    }>;
    getOrders(userId: string): Promise<any[]>;
}
declare const _default: ExchangeService;
export default _default;
