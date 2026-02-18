export declare class AuthService {
    private static instance;
    private constructor();
    static getInstance(): AuthService;
    private generateToken;
    sendOTP(accountNumber: string): Promise<boolean>;
    verifyOTP(accountNumber: string, otp: string): Promise<boolean>;
    private deleteOTP;
    login(accountNumber: string, otp: string): Promise<{
        user: any;
        token: string;
    }>;
    signup(data: {
        accountHolderName: string;
        accountNumber: string;
        ifscCode: string;
        otp: string;
        referralCode?: string;
    }): Promise<{
        user: any;
        token: string;
    }>;
}
declare const _default: AuthService;
export default _default;
