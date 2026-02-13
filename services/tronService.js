const supabase = require('../utils/supabase');
const { TronWeb } = require('tronweb');
const ledgerService = require('./ledgerService');
const walletService = require('./walletService');
const { decrypt } = require('../utils/crypto');
const config = require('../config');
const cron = require('node-cron');

const TRON_CONFIG = {
    fullNode: config.TRON.FULL_NODE,
    solidityNode: config.TRON.SOLIDITY_NODE,
    eventServer: config.TRON.EVENT_SERVER
};

const USDT_CONTRACT = config.TRON.USDT_CONTRACT;

const tronWeb = new TronWeb(TRON_CONFIG);

class TronService {
    constructor() {
        this.isProcessing = false;
        this.contract = USDT_CONTRACT;
    }

    startListener() {
        cron.schedule('*/5 * * * * *', () => this.checkDeposits());
    }

    async checkDeposits() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            const { data: addresses, error } = await supabase
                .from('deposit_addresses')
                .select('*')
                .eq('is_used', false);
            
            if (error) throw error;
            if (!addresses) return;

            for (const addr of addresses) {
                await this.processAddress(addr);
            }
        } catch (err) {
            console.error('Tron Listener Error:', err);
        } finally {
            this.isProcessing = false;
        }
    }

    async processAddress(addr) {
        try {
            const balanceSun = await tronWeb.trx.getBalance(addr.tron_address);
            const balanceTRX = balanceSun / 1000000;
            
            const contract = await tronWeb.contract().at(this.contract);
            const balanceUSDTBig = await contract.balanceOf(addr.tron_address).call();
            const balanceUSDT = Number(balanceUSDTBig) / 1000000;

            if (balanceUSDT > 0) {
                console.log(`Deposit detected: ${balanceUSDT} USDT at ${addr.tron_address}`);
                
                await ledgerService.creditDeposit(addr.user_id, balanceUSDT, addr.tron_address);
                
                await supabase
                    .from('deposit_addresses')
                    .update({ is_used: true, last_balance: balanceUSDT })
                    .eq('id', addr.id);
            }
        } catch (err) {
            console.error(`Error processing address ${addr.tron_address}:`, err.message);
        }
    }

    async getTreasuryBalance(address) {
        try {
            const balanceSun = await tronWeb.trx.getBalance(address);
            const contract = await tronWeb.contract().at(this.contract);
            const balanceUSDTBig = await contract.balanceOf(address).call();
            
            return {
                trx: balanceSun / 1000000,
                usdt: Number(balanceUSDTBig) / 1000000
            };
        } catch (err) {
            return { trx: 0, usdt: 0 };
        }
    }

    async sendUSDT(toAddress, amount) {
        try {
            const systemWallet = await walletService.getWallet('system');
            if (!systemWallet) throw new Error('System wallet not found');

            tronWeb.setPrivateKey(systemWallet.privateKey);
            const contract = await tronWeb.contract().at(this.contract);
            
            const amountInUnits = Math.floor(amount * 1000000);
            const txHash = await contract.transfer(toAddress, amountInUnits).send();
            
            return txHash;
        } catch (err) {
            console.error('USDT Send Error:', err.message);
            return null;
        }
    }

    async checkConfirmation(txHash) {
        try {
            const tx = await tronWeb.trx.getTransaction(txHash);
            if (!tx || !tx.ret) return 'pending';
            
            if (tx.ret[0].contractRet === 'SUCCESS') {
                return 'confirmed';
            } else {
                return 'failed';
            }
        } catch (err) {
            return 'pending';
        }
    }
}

module.exports = new TronService();
