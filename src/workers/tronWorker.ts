import { TronWeb } from 'tronweb';
import config from '../config/index.js';
import supabase from '../utils/supabase.js';
import walletService from '../services/walletService.js';
import { decrypt } from '../utils/crypto.js';
import tronService from '../services/tronService.js';
import wsService from '../services/wsService.js';

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

const tronWeb = new TronWeb(TRON_CONFIG);

export class TronWorker {
  private static instance: TronWorker;
  private isProcessing: boolean = false;
  private timer: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): TronWorker {
    if (!TronWorker.instance) {
      TronWorker.instance = new TronWorker();
    }
    return TronWorker.instance;
  }

  public start() {
    console.log('[TRON_WORKER] Starting persistent deposit listener...');
    // 1. Regular Polling as fallback (every 15s)
    this.timer = setInterval(() => this.checkDeposits(), 15000);

    // 2. Real-time Event Listening (if event server is available)
    this.listenToEvents();
  }

  private async listenToEvents() {
    try {
      console.log(`[TRON_WORKER] Subscribing to USDT Transfer events for contract: ${config.tron.usdtContract}`);
      
      // 1. WebSocket / Watcher (Real-time)
      tronWeb.contract(USDT_ABI, config.tron.usdtContract).then((contract: any) => {
        contract.Transfer().watch(async (err: any, event: any) => {
          if (err) {
            console.error('[TRON_WORKER] Event listener error:', err);
            return;
          }
          if (event && event.result) {
            await this.handleEvent(event.result, event.transaction_id);
          }
        });
      });

      // 2. Event Polling (Fallback for reliability)
      setInterval(() => this.pollEvents(), 30000);

    } catch (err) {
      console.error('[TRON_WORKER] Failed to start event listener:', err);
    }
  }

  private async pollEvents() {
    try {
      // Use Trongrid Event API
      const response = await fetch(`${config.tron.eventServer}/v1/contracts/${config.tron.usdtContract}/events?event_name=Transfer&limit=50&only_confirmed=true`);
      const json: any = await response.json();
      
      if (json.success && json.data) {
        for (const event of json.data) {
          await this.handleEvent(event.result, event.transaction_id);
        }
      }
    } catch (err) {
      console.error('[TRON_WORKER] Polling error:', err);
    }
  }

  private async handleEvent(result: any, txHash: string) {
    const { to, value } = result;
    // Handle both hex and base58 formats
    const toAddress = to.startsWith('41') ? tronWeb.address.fromHex(to) : to;
    const amount = Number(value) / 1000000;

    const { data: addr, error } = await supabase
      .from('deposit_addresses')
      .select('*')
      .eq('tron_address', toAddress)
      .eq('is_used', false)
      .maybeSingle();

    if (addr) {
      console.log(`[TRON_WORKER] Event-based Transfer detected: ${amount} USDT to ${toAddress}`);
      await this.processAddress(addr);
    }
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async checkDeposits() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Find active deposit addresses that haven't been swept yet
      // We also check for addresses that have recently expired but may have received funds
      const { data: addresses, error } = await supabase
        .from('deposit_addresses')
        .select('*')
        .eq('is_used', false);
      
      if (error) throw error;
      if (!addresses || addresses.length === 0) return;

      for (const addr of addresses) {
        // Late deposit handling: check if address is expired but still has balance
        const isExpired = new Date(addr.expires_at) < new Date();
        if (isExpired) {
          console.log(`[TRON_WORKER] Checking expired address ${addr.tron_address} for late deposit...`);
        }
        await this.processAddress(addr);
      }
    } catch (err) {
      console.error('[TRON_WORKER] Error checking deposits:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processAddress(addr: any) {
    try {
      const contract = await tronWeb.contract().at(config.tron.usdtContract);
      const balanceUSDTBig = await contract.balanceOf(addr.tron_address).call();
      const balanceUSDT = Number(balanceUSDTBig) / 1000000;

      if (balanceUSDT > 0) {
        console.log(`[TRON_WORKER] Deposit detected: ${balanceUSDT} USDT at ${addr.tron_address}`);
        
        // Try to get actual transaction hash from TronGrid if possible
        let txHash = `DEP_${addr.tron_address}_${Date.now()}`;
        try {
          const response = await fetch(`${config.tron.fullNode}/v1/accounts/${addr.tron_address}/transactions/trc20?limit=1&contract_address=${config.tron.usdtContract}`);
          const json: any = await response.json();
          if (json.success && json.data && json.data.length > 0) {
            txHash = json.data[0].transaction_id;
            console.log(`[TRON_WORKER] Found real TX hash: ${txHash}`);
          }
        } catch (e) {
          console.warn(`[TRON_WORKER] Could not fetch real TX hash, using fallback: ${txHash}`);
        }

        // Use RPC function for atomic credit
        const { data, error } = await supabase.rpc('credit_deposit', {
          p_user_id: addr.user_id,
          p_amount: balanceUSDT,
          p_tx_hash: txHash,
          p_description: `USDT Deposit via ${addr.tron_address}`
        });

        if (error) {
          console.error(`[TRON_WORKER] RPC credit_deposit failed for ${addr.tron_address}:`, error);
          throw error;
        }

        if (data && !data.success) {
          console.warn(`[TRON_WORKER] Deposit credit skipped: ${data.message}`);
          // If it's a duplicate, we should still mark the address as used to stop polling
          if (data.message === 'Duplicate transaction' || data.message === 'Transaction already processed') {
            await supabase
              .from('deposit_addresses')
              .update({ is_used: true, last_balance: balanceUSDT })
              .eq('id', addr.id);
          }
          return;
        }

        // Record in blockchain_transactions
        try {
          await supabase.from('blockchain_transactions').upsert({
            tx_hash: txHash,
            user_id: addr.user_id,
            amount: balanceUSDT,
            to_address: addr.tron_address,
            status: 'credited',
            processed_at: new Date().toISOString()
          });
        } catch (dbErr) {
          console.error('[TRON_WORKER] Failed to record in blockchain_transactions:', dbErr);
        }

        // Mark address as used/processed
        await supabase
          .from('deposit_addresses')
          .update({ is_used: true, last_balance: balanceUSDT })
          .eq('id', addr.id);
          
        console.log(`[TRON_WORKER] Successfully credited ${balanceUSDT} USDT to user ${addr.user_id}`);

        // Real-time notification to user
        wsService.sendToUser(addr.user_id, 'DEPOSIT_CREDITED', {
          amount: balanceUSDT,
          txHash,
          tronAddress: addr.tron_address
        });

        // Trigger Automatic Sweep to Treasury
        this.triggerSweep(addr, balanceUSDT, txHash).catch(err => {
          console.error(`[TRON_WORKER] Auto-sweep failed for ${addr.tron_address}:`, err.message);
        });
      }
    } catch (err: any) {
      console.error(`[TRON_WORKER] Error processing address ${addr.tron_address}:`, err.message);
    }
  }

  private async triggerSweep(addr: any, amount: number, originalTxHash: string) {
    try {
      const treasuryWallet = await walletService.getWallet('treasury');
      if (!treasuryWallet) {
        console.warn('[TRON_WORKER] Treasury wallet not configured, skipping sweep');
        return;
      }

      const privateKey = decrypt(addr.private_key_encrypted);
      if (!privateKey) throw new Error('Failed to decrypt deposit address private key');

      // 1. Check if deposit address needs TRX for gas
      const trxBalance = await tronWeb.trx.getBalance(addr.tron_address);
      const trxNeeded = 15; // Estimated 13.5 TRX for TRC20 transfer
      
      if (Number(tronWeb.fromSun(trxBalance)) < trxNeeded) {
        console.log(`[TRON_WORKER] Sending ${trxNeeded} TRX for gas to ${addr.tron_address}`);
        await tronService.sendTRX(addr.tron_address, trxNeeded);
        // Wait a bit for TRX to arrive
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      // 2. Perform Sweep
      console.log(`[TRON_WORKER] Sweeping ${amount} USDT to treasury: ${treasuryWallet.address}`);
      const sweepTxHash = await walletService.sweepFunds(
        addr.tron_address,
        privateKey,
        amount,
        treasuryWallet.address
      );

      if (sweepTxHash) {
        console.log(`[TRON_WORKER] Sweep successful: ${sweepTxHash}`);
        
        // Update blockchain_transactions with sweep info
        await supabase
          .from('blockchain_transactions')
          .update({ 
            sweep_tx_hash: sweepTxHash,
            swept_at: new Date().toISOString()
          })
          .eq('tx_hash', originalTxHash);
      }
    } catch (err: any) {
      throw err;
    }
  }
}

export default TronWorker.getInstance();
