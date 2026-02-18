import dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config();
const configSchema = z.object({
    PORT: z.string().default('3000').transform(Number),
    JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
    SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    TREASURY_ADDRESS: z.string().min(1, 'TREASURY_ADDRESS is required'),
    SYSTEM_PRIVATE_KEY: z.string().min(1, 'SYSTEM_PRIVATE_KEY is required'),
    ENCRYPTION_KEY: z.string().length(32, 'ENCRYPTION_KEY must be 32 characters'),
    RAZORPAY_KEY_ID: z.string().min(1, 'RAZORPAY_KEY_ID is required'),
    RAZORPAY_KEY_SECRET: z.string().min(1, 'RAZORPAY_KEY_SECRET is required'),
    BANK_ACCOUNT_NUMBER: z.string().min(1, 'BANK_ACCOUNT_NUMBER is required'),
    RAZORPAY_WEBHOOK_SECRET: z.string().min(1, 'RAZORPAY_WEBHOOK_SECRET is required'),
    KYC_MODE: z.enum(['MANUAL', 'AUTO']).default('MANUAL'),
    TRON_FULL_NODE: z.string().url().default('https://api.trongrid.io'),
    TRON_SOLIDITY_NODE: z.string().url().default('https://api.trongrid.io'),
    TRON_EVENT_SERVER: z.string().url().default('https://api.trongrid.io'),
    USDT_CONTRACT_ADDRESS: z.string().default('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_PHONE_NUMBER: z.string().optional(),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required for migrations'),
});
const env = configSchema.safeParse(process.env);
if (!env.success) {
    console.error('❌ Invalid environment variables:', JSON.stringify(env.error.format(), null, 2));
    process.exit(1);
}
const validatedConfig = env.data;
export const config = {
    port: validatedConfig.PORT,
    jwtSecret: validatedConfig.JWT_SECRET,
    supabase: {
        url: validatedConfig.SUPABASE_URL,
        serviceRoleKey: validatedConfig.SUPABASE_SERVICE_ROLE_KEY,
    },
    nodeEnv: validatedConfig.NODE_ENV,
    treasuryAddress: validatedConfig.TREASURY_ADDRESS,
    systemPrivateKey: validatedConfig.SYSTEM_PRIVATE_KEY,
    encryptionKey: validatedConfig.ENCRYPTION_KEY,
    razorpay: {
        keyId: validatedConfig.RAZORPAY_KEY_ID,
        keySecret: validatedConfig.RAZORPAY_KEY_SECRET,
        bankAccount: validatedConfig.BANK_ACCOUNT_NUMBER,
        webhookSecret: validatedConfig.RAZORPAY_WEBHOOK_SECRET,
    },
    kycMode: validatedConfig.KYC_MODE,
    tron: {
        fullNode: validatedConfig.TRON_FULL_NODE,
        solidityNode: validatedConfig.TRON_SOLIDITY_NODE,
        eventServer: validatedConfig.TRON_EVENT_SERVER,
        usdtContract: validatedConfig.USDT_CONTRACT_ADDRESS,
    },
    twilio: {
        accountSid: validatedConfig.TWILIO_ACCOUNT_SID,
        authToken: validatedConfig.TWILIO_AUTH_TOKEN,
        phoneNumber: validatedConfig.TWILIO_PHONE_NUMBER,
    },
    databaseUrl: validatedConfig.DATABASE_URL,
};
export default config;
//# sourceMappingURL=index.js.map