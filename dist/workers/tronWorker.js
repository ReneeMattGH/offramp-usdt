import { TronWeb } from 'tronweb';
import config from '../config/index.js';
import supabase from '../utils/supabase.js';
const TRON_CONFIG = {
    fullNode: config.tron.fullNode,
    solidityNode: config.tron.solidityNode,
    eventServer: config.tron.eventServer
};
const tronWeb = new TronWeb(TRON_CONFIG);
export class TronWorker {
    static instance;
    isProcessing = false;
    timer = null;
    constructor() { }
    static getInstance() {
        if (!TronWorker.instance) {
            TronWorker.instance = new TronWorker();
        }
        return TronWorker.instance;
    }
    start() {
        console.log('[TRON_WORKER] Starting persistent deposit listener...');
        // Poll every 10 seconds for deposits
        this.timer = setInterval(() => this.checkDeposits(), 10000);
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    async checkDeposits() {
        if (this.isProcessing)
            return;
        this.isProcessing = true;
        try {
            // Find active deposit addresses that haven't been swept yet
            const { data: addresses, error } = await supabase
                .from('deposit_addresses')
                .select('*')
                .eq('is_used', false);
            if (error)
                throw error;
            if (!addresses || addresses.length === 0)
                return;
            for (const addr of addresses) {
                await this.processAddress(addr);
            }
        }
        catch (err) {
            console.error('[TRON_WORKER] Error checking deposits:', err);
        }
        finally {
            this.isProcessing = false;
        }
    }
    async processAddress(addr) {
        try {
            const contract = await tronWeb.contract().at(config.tron.usdtContract);
            const balanceUSDTBig = await contract.balanceOf(addr.tron_address).call();
            const balanceUSDT = Number(balanceUSDTBig) / 1000000;
            if (balanceUSDT > 0) {
                console.log(`[TRON_WORKER] Deposit detected: ${balanceUSDT} USDT at ${addr.tron_address}`);
                // Use RPC function for atomic credit
                const { data, error } = await supabase.rpc('credit_deposit', {
                    p_user_id: addr.user_id,
                    p_amount: balanceUSDT,
                    p_tx_hash: `DEP_${addr.tron_address}_${Date.now()}`, // Temporary ref until we get real TX list
                    p_description: `USDT Deposit via ${addr.tron_address}`
                });
                if (error)
                    throw error;
                // Mark address as used/processed
                await supabase
                    .from('deposit_addresses')
                    .update({ is_used: true, last_balance: balanceUSDT })
                    .eq('id', addr.id);
                console.log(`[TRON_WORKER] Successfully credited ${balanceUSDT} USDT to user ${addr.user_id}`);
            }
        }
        catch (err) {
            console.error(`[TRON_WORKER] Error processing address ${addr.tron_address}:`, err.message);
        }
    }
}
export default TronWorker.getInstance();
//# sourceMappingURL=tronWorker.js.map