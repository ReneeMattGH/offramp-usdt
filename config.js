require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 3000,
    JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-key-change-me',
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NODE_ENV: process.env.NODE_ENV || 'development',
    TREASURY_ADDRESS: process.env.TREASURY_ADDRESS,
    SYSTEM_PRIVATE_KEY: process.env.SYSTEM_PRIVATE_KEY,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    RAZORPAY: {
        KEY_ID: process.env.RAZORPAY_KEY_ID,
        KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
        BANK_ACCOUNT: process.env.BANK_ACCOUNT_NUMBER,
        WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET
    },
    KYC_MODE: process.env.KYC_MODE || 'MANUAL',
    TRON: {
        FULL_NODE: process.env.TRON_FULL_NODE || 'https://api.trongrid.io',
        SOLIDITY_NODE: process.env.TRON_SOLIDITY_NODE || 'https://api.trongrid.io',
        EVENT_SERVER: process.env.TRON_EVENT_SERVER || 'https://api.trongrid.io',
        USDT_CONTRACT: process.env.USDT_CONTRACT_ADDRESS || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' // Mainnet USDT
    }
};
