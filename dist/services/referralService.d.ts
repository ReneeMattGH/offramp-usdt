export declare class ReferralService {
    private static instance;
    private constructor();
    static getInstance(): ReferralService;
    generateCode(): string;
    ensureReferralCode(userId: string): Promise<string | null>;
    processSignupReferral(newUserId: string, referralCode?: string): Promise<void>;
    awardPoints(userId: string, amount: number, type: string, relatedUserId?: string | null, description?: string): Promise<void>;
    getReferralStats(userId: string): Promise<{
        code: any;
        points: any;
        totalReferrals: number;
    }>;
}
declare const _default: ReferralService;
export default _default;
