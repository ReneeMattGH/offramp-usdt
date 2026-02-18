export declare class SmsService {
    private static instance;
    private constructor();
    static getInstance(): SmsService;
    sendOTP(phoneNumber: string, otp: string): Promise<boolean>;
}
declare const _default: SmsService;
export default _default;
