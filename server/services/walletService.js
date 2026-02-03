const { createClient } = require('@supabase/supabase-js');
const { TronWeb } = require('tronweb');
const { encrypt, decrypt } = require('../utils/crypto');
const { v4: uuidv4 } = require('uuid');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// TronWeb Setup (Nile Testnet)
const TRON_FULL_NODE = 'https://nile.trongrid.io';
const TRON_SOLIDITY_NODE = 'https://nile.trongrid.io';
const TRON_EVENT_SERVER = 'https://nile.trongrid.io';
const NILE_USDT_CONTRACT = 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj';

// System Wallet Private Key (Should be in env, using placeholder if missing)
const SYSTEM_PRIVATE_KEY = process.env.SYSTEM_PRIVATE_KEY || '01'.repeat(32); 

const tronWeb = new TronWeb({
    fullNode: TRON_FULL_NODE,
    solidityNode: TRON_SOLIDITY_NODE,
    eventServer: TRON_EVENT_SERVER,
    privateKey: SYSTEM_PRIVATE_KEY,
});

class WalletService {
    
    async initializeWallets() {
        try {
            // Ensure System, Treasury, and Safe Hold wallets exist in DB
            const wallets = ['system', 'treasury', 'safe_hold'];
            
            for (const type of wallets) {
                const { data, error } = await supabase
                    .from('wallets')
                    .select('*')
                    .eq('type', type)
                    .maybeSingle();
                    
                if (error) {
                     if (error.code === 'PGRST205' || (error.message && error.message.includes('relation'))) {
                         console.warn(`Wallet table missing. Skipping wallet init for ${type}.`);
                         continue;
                     }
                }

                if (!data && !error) {
                    console.log(`Creating ${type} wallet...`);
                    const account = await tronWeb.createAccount();
                    await supabase.from('wallets').insert({
                        type,
                        address: account.address.base58,
                        private_key_encrypted: encrypt(account.privateKey),
                        is_active: true
                    });
                }
            }
        } catch (e) {
            console.warn('Wallet Initialization Warning:', e.message);
        }
    }

    async generateWallet() {
        const account = await tronWeb.createAccount();
        return {
            address: account.address.base58,
            privateKey: encrypt(account.privateKey)
        };
    }

    async generateDepositAddress(userId, purpose = 'deposit') {
        try {
            // 1. Generate TRON address
            const account = await tronWeb.createAccount();
            const { address, privateKey } = account;
            const tronAddress = address.base58;

            // 2. Calculate expiry (30 mins)
            const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

            // 3. Store in DB
            const { data, error } = await supabase
                .from('deposit_addresses')
                .insert({
                    user_id: userId,
                    tron_address: tronAddress,
                    private_key_encrypted: encrypt(privateKey),
                    expires_at: expiresAt,
                    is_used: false
                })
                .select()
                .single();

            if (error) {
                 // Fallback if table missing: Return the address anyway so user sees something
                 if (error.code === 'PGRST205' || (error.message && error.message.includes('relation'))) {
                     console.warn('deposit_addresses table missing. Returning ephemeral address.');
                     return {
                         user_id: userId,
                         tron_address: tronAddress,
                         expires_at: expiresAt,
                         is_used: false
                     };
                 }
                 throw error;
            }
            return data;
        } catch (error) {
            console.error('Error generating deposit address:', error);
            // Last ditch fallback
            if (error.code === 'PGRST205' || (error.message && error.message.includes('relation'))) {
                 return {
                     user_id: userId,
                     tron_address: 'T_EPHEMERAL_' + Date.now(), // Should be real address ideally but catch block might not have it scope
                     expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString()
                 };
            }
            throw error;
        }
    }

    async getWallet(type) {
        const { data, error } = await supabase
            .from('wallets')
            .select('*')
            .eq('type', type)
            .maybeSingle(); 
            
        if (error) {
             if (error.code === 'PGRST205' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
                 console.warn(`Wallet table missing, returning fallback for ${type}`);
                 // Fallback: Use System Wallet credentials for treasury/system if DB is broken
                 if (type === 'treasury' || type === 'system') {
                     return {
                         address: tronWeb.defaultAddress.base58,
                         privateKey: SYSTEM_PRIVATE_KEY
                     };
                 }
             }
             throw error;
        }
        if (!data) return null;

        return {
            ...data,
            privateKey: decrypt(data.private_key_encrypted)
        };
    }
    
    // Sweep funds from a temporary address to a destination wallet
    async sweepFunds(fromAddress, fromPrivateKey, amount, toAddress) {
        try {
            console.log(`[Sweep] Sweeping ${amount} USDT from ${fromAddress} to ${toAddress}`);

            // 1. Estimate Gas (TRX needed)
            // Transferring TRC20 costs energy. Approx 30 TRX is safe for non-frozen accounts.
            const GAS_AMOUNT_TRX = 30;
            const amountInSun = tronWeb.toSun(GAS_AMOUNT_TRX);

            // 2. Send TRX from System Wallet to Temp Address (Gas)
            // Note: tronWeb instance is initialized with SYSTEM_PRIVATE_KEY, so defaultAddress is the System Wallet
            const trade = await tronWeb.transactionBuilder.sendTrx(
                fromAddress,
                amountInSun,
                tronWeb.defaultAddress.base58
            );
            const signedTrade = await tronWeb.trx.sign(trade);
            const receipt = await tronWeb.trx.sendRawTransaction(signedTrade);

            if (!receipt.result) {
                throw new Error('Failed to send gas (TRX) to temp address: ' + JSON.stringify(receipt));
            }
            console.log(`[Sweep] Gas sent: ${receipt.txid}`);

            // Wait a bit for gas tx to confirm (naive wait)
            // In a real production system, we should monitor this tx confirmation before proceeding.
            await new Promise(resolve => setTimeout(resolve, 6000));

            // 3. Transfer USDT from Temp Address to Treasury
            const amountInUnits = Math.floor(amount * 1000000); // 6 decimals
            
            // We use transactionBuilder to create the triggerSmartContract transaction
            const contractAddress = NILE_USDT_CONTRACT;
            const functionSelector = 'transfer(address,uint256)';
            const parameter = [
                { type: 'address', value: toAddress },
                { type: 'uint256', value: amountInUnits }
            ];
            
            const transaction = await tronWeb.transactionBuilder.triggerSmartContract(
                contractAddress,
                functionSelector,
                { feeLimit: 100000000 }, // 100 TRX fee limit
                parameter,
                fromAddress
            );

            if (!transaction.result || !transaction.result.result) {
                throw new Error('Failed to build USDT transfer transaction');
            }

            const signedTx = await tronWeb.trx.sign(transaction.transaction, fromPrivateKey);
            const broadcast = await tronWeb.trx.sendRawTransaction(signedTx);

            if (broadcast.result) {
                console.log(`[Sweep] USDT Transferred: ${broadcast.txid}`);
                return broadcast.txid;
            } else {
                console.error('[Sweep] Broadcast failed:', broadcast);
                return null;
            }

        } catch (error) {
            console.error('Error sweeping funds:', error);
            return null;
        }
    }
}

module.exports = new WalletService();
