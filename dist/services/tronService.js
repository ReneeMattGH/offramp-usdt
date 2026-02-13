import { TronWeb } from 'tronweb';
import config from '../config/index.js';
import supabase from '../utils/supabase.js';
import { decrypt } from '../utils/crypto.js';
const TRON_CONFIG = {
    fullNode: config.tron.fullNode,
    solidityNode: config.tron.solidityNode,
    eventServer: config.tron.eventServer
};
const tronWeb = new TronWeb(TRON_CONFIG);
export class TronService {
    static instance;
    constructor() { }
    static getInstance() {
        if (!TronService.instance) {
            TronService.instance = new TronService();
        }
        return TronService.instance;
    }
    async sendUSDT(toAddress, amount) {
        try {
            // Get system wallet
            const { data: wallet, error } = await supabase
                .from('wallets')
                .select('*')
                .eq('type', 'system')
                .single();
            if (error || !wallet)
                throw new Error('System wallet not found');
            const privateKey = decrypt(wallet.private_key_encrypted);
            if (!privateKey)
                throw new Error('Failed to decrypt system private key');
            tronWeb.setPrivateKey(privateKey);
            const contract = await tronWeb.contract().at(config.tron.usdtContract);
            const amountInUnits = Math.floor(amount * 1000000);
            const txHash = await contract.transfer(toAddress, amountInUnits).send();
            return txHash;
        }
        catch (error) {
            console.error('[TRON_SERVICE] Send USDT failed:', error.message);
            return null;
        }
    }
    async checkConfirmation(txHash) {
        try {
            const tx = await tronWeb.trx.getTransaction(txHash);
            if (!tx || !tx.ret)
                return 'pending';
            if (tx.ret[0]?.contractRet === 'SUCCESS') {
                // Check confirmations (optional, but let's just check if it's in a block)
                const info = await tronWeb.trx.getTransactionInfo(txHash);
                if (info && info.blockNumber) {
                    return 'confirmed';
                }
                return 'pending';
            }
            return 'failed';
        }
        catch (error) {
            return 'pending';
        }
    }
    async getTreasuryBalance(address) {
        try {
            const trxBalance = await tronWeb.trx.getBalance(address);
            const contract = await tronWeb.contract().at(config.tron.usdtContract);
            const usdtBalance = await contract.balanceOf(address).call();
            return {
                trx: tronWeb.fromSun(trxBalance),
                usdt: Number(usdtBalance) / 1000000
            };
        }
        catch (err) {
            console.error('[TRON_SERVICE] Failed to get treasury balance:', err);
            return { trx: 0, usdt: 0 };
        }
    }
}
export default TronService.getInstance();
//# sourceMappingURL=tronService.js.map