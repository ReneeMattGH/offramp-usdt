export declare class KycService {
    private static instance;
    private mode;
    private constructor();
    static getInstance(): KycService;
    submitKyc(userId: string, data: any, ipAddress: string | null, file?: any): Promise<{
        success: boolean;
        status: string;
        message: string;
    }>;
    getKycStatus(userId: string): Promise<{
        kyc_status: any;
        kyc_verified_at: any;
        kyc_rejection_reason: any;
    }>;
}
export declare const kycService: KycService;
