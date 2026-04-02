import { TronWeb } from 'tronweb';
import config from '../config/index.js';
import supabase from '../utils/supabase.js';
import { decrypt } from '../utils/crypto.js';

const TRON_CONFIG = {
  fullNode: config.tron.fullNode,
  solidityNode: config.tron.solidityNode,
  eventServer: config.tron.eventServer,
  headers: config.tron.proApiKey ? { 'TRON-PRO-API-KEY': config.tron.proApiKey } : {}
};

const USDT_ABI = [
  {
    "constant": true,
    "inputs": [{ "name": "_owner", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "balance", "type": "uint256" }],
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      { "name": "_to", "type": "address" },
      { "name": "_value", "type": "uint256" }
    ],
    "name": "transfer",
    "outputs": [{ "name": "success", "type": "bool" }],
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "from", "type": "address" },
      { "indexed": true, "name": "to", "type": "address" },
      { "indexed": false, "name": "value", "type": "uint256" }
    ],
    "name": "Transfer",
    "type": "event"
  }
];

// For TronWeb v6+, we use the options object constructor
const tronWeb = new TronWeb(TRON_CONFIG);

export class TronService {
  private static instance: TronService;

  private constructor() {}

  public static getInstance(): TronService {
    if (!TronService.instance) {
      TronService.instance = new TronService();
    }
    return TronService.instance;
  }

  async sendUSDT(toAddress: string, amount: number): Promise<string | null> {
    try {
      // Get system wallet
      const { data: wallet, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('type', 'system')
        .single();

      let privateKey: string | null = null;
      if (wallet) {
        privateKey = decrypt(wallet.private_key_encrypted);
      } else if (config.systemPrivateKey) {
        privateKey = config.systemPrivateKey;
      }

      if (!privateKey) throw new Error('System private key not found');

      tronWeb.setPrivateKey(privateKey);
      const contract = await tronWeb.contract(USDT_ABI, config.tron.usdtContract);
      
      const amountInUnits = Math.floor(amount * 1000000);
      const txHash = await contract.transfer(toAddress, amountInUnits).send();
      
      return txHash;
    } catch (error: any) {
      console.error('[TRON_SERVICE] Send USDT failed:', error.message);
      return null;
    }
  }

  async sendTRX(toAddress: string, amount: number): Promise<string | null> {
    try {
      const { data: wallet, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('type', 'system')
        .single();

      let privateKey: string | null = null;
      if (wallet) {
        privateKey = decrypt(wallet.private_key_encrypted);
      } else if (config.systemPrivateKey) {
        privateKey = config.systemPrivateKey;
      }

      if (!privateKey) throw new Error('System private key not found');

      tronWeb.setPrivateKey(privateKey);
      const amountInSun = Number(tronWeb.toSun(amount));
      const tx = await tronWeb.trx.sendTransaction(toAddress, amountInSun);
      return (tx as any).txid || (tx as any).transaction?.txID;
    } catch (error: any) {
      console.error('[TRON_SERVICE] Send TRX failed:', error.message);
      return null;
    }
  }

  async checkConfirmation(txHash: string): Promise<'confirmed' | 'failed' | 'pending'> {
    try {
      const tx = await tronWeb.trx.getTransaction(txHash);
      if (!tx || !tx.ret) return 'pending';
      
      if (tx.ret[0]?.contractRet === 'SUCCESS') {
        // Check confirmations (optional, but let's just check if it's in a block)
        const info = await tronWeb.trx.getTransactionInfo(txHash);
        if (info && info.blockNumber) {
          return 'confirmed';
        }
        return 'pending';
      }
      return 'failed';
    } catch (error) {
      return 'pending';
    }
  }

  async getTreasuryBalance(address: string) {
    try {
      const trxBalance = await tronWeb.trx.getBalance(address);
      const contract = await tronWeb.contract().at(config.tron.usdtContract);
      const usdtBalance = await contract.balanceOf(address).call();
      
      return {
        trx: tronWeb.fromSun(trxBalance),
        usdt: Number(usdtBalance) / 1000000
      };
    } catch (err) {
      console.error('[TRON_SERVICE] Failed to get treasury balance:', err);
      return { trx: 0, usdt: 0 };
    }
  }
}

export default TronService.getInstance();
