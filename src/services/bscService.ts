
import { ethers } from 'ethers';
import config from '../config/index.js';
import supabase from '../utils/supabase.js';
import wsService from './wsService.js';

const USDT_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

const BSC_RPC = "https://bsc-dataseed.binance.org/";
const BSC_USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";

export class BSCService {
  private static instance: BSCService;
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private activeAddresses: Set<string> = new Set();
  private lastCacheRefresh: number = 0;
  private isProcessing: boolean = false;
  private lastCheckedBlock: number = 0;

  private constructor() {
    this.provider = new ethers.JsonRpcProvider(BSC_RPC);
    this.contract = new ethers.Contract(BSC_USDT_CONTRACT, USDT_ABI, this.provider);
    this.refreshCache();
    // Refresh cache every 2 minutes
    setInterval(() => this.refreshCache(), 120000);
  }

  public static getInstance(): BSCService {
    if (!BSCService.instance) {
      BSCService.instance = new BSCService();
    }
    return BSCService.instance;
  }

  public async startListening() {
    console.log('[BSC_SERVICE] Starting BSC USDT listener...');
    
    // Initial block to start from
    try {
      this.lastCheckedBlock = await this.provider.getBlockNumber();
    } catch (e) {
      this.lastCheckedBlock = 0;
    }

    // Significant increase in interval to 2 minutes to prevent egress and RPC limits
    setInterval(() => this.pollEvents(), 120000);
  }

  private async refreshCache() {
    try {
      const { data, error } = await supabase
        .from('deposit_addresses')
        .select('tron_address')
        .eq('network', 'bsc')
        .eq('is_used', false);

      if (error) throw error;

      const newAddresses = new Set<string>();
      if (data) {
        data.forEach(addr => {
          if (addr.tron_address) {
            newAddresses.add(addr.tron_address.toLowerCase());
          }
        });
      }
      
      this.activeAddresses = newAddresses;
      this.lastCacheRefresh = Date.now();
      console.log(`[BSC_SERVICE] Cache refreshed: ${this.activeAddresses.size} active BSC addresses`);
    } catch (err) {
      console.error('[BSC_SERVICE] Failed to refresh address cache:', err);
    }
  }

  public addActiveAddress(address: string) {
    this.activeAddresses.add(address.toLowerCase());
  }

  private async pollEvents() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const currentBlock = await this.provider.getBlockNumber();
      
      // If we haven't set lastCheckedBlock, start from current - 10
      if (this.lastCheckedBlock === 0) {
        this.lastCheckedBlock = currentBlock - 10;
      }

      // Limit the block range to avoid large data sets
      const fromBlock = Math.max(this.lastCheckedBlock + 1, currentBlock - 200);
      
      if (fromBlock > currentBlock) return;

      console.log(`[BSC_SERVICE] Polling blocks ${fromBlock} to ${currentBlock}`);
      const events = await this.contract.queryFilter("Transfer", fromBlock, currentBlock);
      
      for (const event of events) {
        if ('args' in event && event.args) {
          const [from, to, value] = event.args;
          // Filter in memory first
          if (this.activeAddresses.has(to.toLowerCase())) {
            await this.handleTransfer(from, to, value, event.transactionHash);
          }
        }
      }

      this.lastCheckedBlock = currentBlock;
    } catch (err: any) {
      if (err.message?.includes('rate limit') || err.message?.includes('socket') || err.message?.includes('fetch failed')) {
        console.warn('[BSC_SERVICE] Network or Rate Limit issue. Skipping cycle.');
      } else {
        console.error('[BSC_SERVICE] Polling error:', err.message || err);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async handleTransfer(from: string, to: string, value: any, txHash: string) {
    const amount = Number(ethers.formatUnits(value, 18));
    
    // Check if this 'to' address matches any of our users' BSC deposit addresses
    // OPTIMIZED QUERY: Select only needed fields
    const { data: addr, error } = await supabase
      .from('deposit_addresses')
      .select('id, user_id, tron_address')
      .eq('network', 'bsc')
      .eq('tron_address', to.toLowerCase())
      .eq('is_used', false)
      .limit(1)
      .maybeSingle();

    if (addr) {
      console.log(`[BSC_SERVICE] Deposit detected: ${amount} USDT to ${to}`);
      await this.processBSCDeposit(addr, amount, txHash);
    }
  }

  private async processBSCDeposit(addr: any, amount: number, txHash: string) {
    try {
      const { data, error } = await supabase.rpc('credit_deposit', {
        p_user_id: addr.user_id,
        p_amount: amount,
        p_tx_hash: txHash,
        p_description: `BSC USDT Deposit via ${addr.address}`
      });

      if (error) throw error;

      await supabase
        .from('deposit_addresses')
        .update({ is_used: true, last_balance: amount })
        .eq('id', addr.id);

      wsService.sendToUser(addr.user_id, 'DEPOSIT_CREDITED', {
        network: 'BSC',
        amount,
        txHash
      });
      
      console.log(`[BSC_SERVICE] Successfully credited ${amount} USDT (BSC) to user ${addr.user_id}`);
    } catch (err) {
      console.error('[BSC_SERVICE] Error processing BSC deposit:', err);
    }
  }

  public async sendUSDT(to: string, amount: number, privateKey: string): Promise<string | null> {
    try {
      const wallet = new ethers.Wallet(privateKey, this.provider);
      const contractWithSigner = this.contract.connect(wallet) as ethers.Contract;
      const tx = await contractWithSigner.transfer(to, ethers.parseUnits(amount.toString(), 18));
      await tx.wait();
      return tx.hash;
    } catch (err) {
      console.error('[BSC_SERVICE] Send USDT failed:', err);
      return null;
    }
  }
}

export default BSCService.getInstance();
