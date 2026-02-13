const supabase = require('../utils/supabase');
const { TronWeb } = require('tronweb');
const { encrypt, decrypt } = require('../utils/crypto');
const config = require('../config');

const tronWeb = new TronWeb({
    fullNode: config.TRON.FULL_NODE,
    solidityNode: config.TRON.SOLIDITY_NODE,
    eventServer: config.TRON.EVENT_SERVER,
    privateKey: config.SYSTEM_PRIVATE_KEY
});

const USDT_CONTRACT = config.TRON.USDT_CONTRACT;

class WalletService {
    async initializeWallets() {
        try {
            const walletTypes = ['system', 'treasury', 'safe_hold'];
            
            for (const type of walletTypes) {
                const { data, error } = await supabase
                    .from('wallets')
                    .select('*')
                    .eq('type', type)
                    .maybeSingle();
                    
                if (error) throw error;

                if (!data) {
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
            console.error('Wallet setup failed:', e.message);
        }
    }

    async generateWallet() {
        const account = await tronWeb.createAccount();
        return {
            address: account.address.base58,
            privateKey: encrypt(account.privateKey)
        };
    }

    async generateDepositAddress(userId) {
        try {
            const account = await tronWeb.createAccount();
            const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

            const { data, error } = await supabase
                .from('deposit_addresses')
                .insert({
                    user_id: userId,
                    tron_address: account.address.base58,
                    private_key_encrypted: encrypt(account.privateKey),
                    expires_at: expiresAt,
                    is_used: false
                })
                .select()
                .single();

            if (error) throw error;

            return {
                user_id: userId,
                tron_address: data.tron_address,
                expires_at: expiresAt
            };
        } catch (e) {
            console.error('Deposit address generation failed:', e.message);
            throw e;
        }
    }

    async getWallet(type) {
        const { data, error } = await supabase
            .from('wallets')
            .select('*')
            .eq('type', type)
            .maybeSingle(); 
            
        if (error || !data) return null;

        return {
            ...data,
            privateKey: decrypt(data.private_key_encrypted)
        };
    }
    
    async sweepFunds(fromAddress, fromPrivateKey, amount, toAddress) {
        try {
            const amountInSun = tronWeb.toSun(30);
            const gasTx = await tronWeb.transactionBuilder.sendTrx(
                fromAddress,
                amountInSun,
                tronWeb.defaultAddress.base58
            );
            const signedGasTx = await tronWeb.trx.sign(gasTx);
            await tronWeb.trx.sendRawTransaction(signedGasTx);

            await new Promise(resolve => setTimeout(resolve, 6000));

            const amountInUnits = Math.floor(amount * 1000000);
            const parameter = [
                { type: 'address', value: toAddress },
                { type: 'uint256', value: amountInUnits }
            ];
            
            const transaction = await tronWeb.transactionBuilder.triggerSmartContract(
                USDT_CONTRACT,
                'transfer(address,uint256)',
                { feeLimit: 100000000 },
                parameter,
                fromAddress
            );

            if (!transaction.result || !transaction.result.result) {
                throw new Error('USDT transfer build failed');
            }

            const signedTx = await tronWeb.trx.sign(transaction.transaction, fromPrivateKey);
            const broadcast = await tronWeb.trx.sendRawTransaction(signedTx);

            return broadcast.result ? broadcast.txid : null;
        } catch (error) {
            console.error('Sweep failed:', error);
            return null;
        }
    }
}

module.exports = new WalletService();
