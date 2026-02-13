export declare const config: {
    port: number;
    jwtSecret: string;
    supabase: {
        url: string;
        serviceRoleKey: string;
    };
    nodeEnv: "development" | "production" | "test";
    treasuryAddress: string;
    systemPrivateKey: string;
    encryptionKey: string;
    razorpay: {
        keyId: string;
        keySecret: string;
        bankAccount: string;
        webhookSecret: string;
    };
    kycMode: "MANUAL" | "AUTO";
    tron: {
        fullNode: string;
        solidityNode: string;
        eventServer: string;
        usdtContract: string;
    };
    twilio: {
        accountSid: string | undefined;
        authToken: string | undefined;
        phoneNumber: string | undefined;
    };
    databaseUrl: string;
};
export default config;
