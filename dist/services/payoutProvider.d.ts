export declare class RazorpayProvider {
    private config;
    initiatePayout(order: any, user: any, bank: any): Promise<{
        status: string;
        reason: any;
        raw: any;
        payout_id?: undefined;
        utr?: undefined;
    } | {
        status: string;
        payout_id: any;
        utr: any;
        raw: any;
        reason?: undefined;
    } | {
        status: string;
        reason: any;
        raw?: undefined;
        payout_id?: undefined;
        utr?: undefined;
    }>;
}
