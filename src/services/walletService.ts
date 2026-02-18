import { TronWeb } from 'tronweb';
import { encrypt, decrypt } from '../utils/crypto.js';
import config from '../config/index.js';
import supabase from '../utils/supabase.js';

const tronWeb = new TronWeb({
  fullNode: config.tron.fullNode,
  solidityNode: config.tron.solidityNode,
  eventServer: config.tron.eventServer,
  privateKey: config.systemPrivateKey
});

export class WalletService {
  private static instance: WalletService;

  private constructor() {}

  public static getInstance(): WalletService {
    if (!WalletService.instance) {
      WalletService.instance = new WalletService();
    }
    return WalletService.instance;
  }

  async generateDepositAddress(userId: string) {
    try {
      const account = await tronWeb.createAccount();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const encryptedKey = encrypt(account.privateKey);

      if (!encryptedKey) throw new Error('Failed to encrypt private key');

      const { data, error } = await supabase
        .from('deposit_addresses')
        .insert({
          user_id: userId,
          tron_address: account.address.base58,
          private_key_encrypted: encryptedKey,
          expires_at: expiresAt,
          is_used: false
        })
        .select()
        .single();

      if (error) throw error;

      return {
        userId,
        tronAddress: data.tron_address,
        expiresAt
      };
    } catch (error: any) {
      console.error('[WALLET_SERVICE] Deposit address generation failed:', error.message);
      throw error;
    }
  }

  async getBalance(userId: string) {
    const { data, error } = await supabase
      .from('ledger_accounts')
      .select('available_balance, locked_balance')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data || { available_balance: 0, locked_balance: 0 };
  }

  async getWallet(type: string) {
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('type', type)
      .maybeSingle();
    
    if (error) throw error;
    return data;
  }

  async sweepFunds(fromAddress: string, privateKey: string, amount: number, toAddress: string): Promise<string | null> {
    try {
      const sweepTronWeb = new TronWeb({
        fullNode: config.tron.fullNode,
        solidityNode: config.tron.solidityNode,
        eventServer: config.tron.eventServer,
        privateKey
      });

      const contract = await sweepTronWeb.contract().at(config.tron.usdtContract);
      const amountInUnits = Math.floor(amount * 1000000);
      const txHash = await contract.transfer(toAddress, amountInUnits).send();
      
      return txHash;
    } catch (error: any) {
      console.error('[WALLET_SERVICE] Sweep failed:', error.message);
      return null;
    }
  }
}

export default WalletService.getInstance();
