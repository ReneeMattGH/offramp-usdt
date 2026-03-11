export declare class PayoutProvider {
    initiatePayout(order: any, user: any, bank: any): Promise<{
        status: string;
        reason: string;
        payout_id: string;
        raw: {
            mode: string;
        };
    }>;
}
