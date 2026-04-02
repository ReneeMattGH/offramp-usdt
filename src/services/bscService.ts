
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

  private constructor() {
    this.provider = new ethers.JsonRpcProvider(BSC_RPC);
    this.contract = new ethers.Contract(BSC_USDT_CONTRACT, USDT_ABI, this.provider);
  }

  public static getInstance(): BSCService {
    if (!BSCService.instance) {
      BSCService.instance = new BSCService();
    }
    return BSCService.instance;
  }

  public async startListening() {
    console.log('[BSC_SERVICE] Starting BSC USDT listener...');
    
    // Use polling for BSC as standard provider.on might be unstable without WebSocket
    setInterval(() => this.pollEvents(), 30000);
    
    this.contract.on("Transfer", async (from, to, value, event) => {
      await this.handleTransfer(from, to, value, event.transactionHash);
    });
  }

  private async pollEvents() {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const events = await this.contract.queryFilter("Transfer", currentBlock - 100, currentBlock);
      for (const event of events) {
        if ('args' in event && event.args) {
          const [from, to, value] = event.args;
          await this.handleTransfer(from, to, value, event.transactionHash);
        }
      }
    } catch (err) {
      console.error('[BSC_SERVICE] Polling error:', err);
    }
  }

  private async handleTransfer(from: string, to: string, value: any, txHash: string) {
    const amount = Number(ethers.formatUnits(value, 18)); // BSC USDT uses 18 decimals
    
    // Check if this 'to' address matches any of our users' BSC deposit addresses
    const { data: addr, error } = await supabase
      .from('deposit_addresses')
      .select('*')
      .eq('network', 'bsc')
      .eq('tron_address', to.toLowerCase()) // Reusing tron_address column for BSC for simplicity
      .eq('is_used', false)
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
