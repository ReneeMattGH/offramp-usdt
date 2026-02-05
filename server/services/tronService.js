const { createClient } = require('@supabase/supabase-js');
const { TronWeb } = require('tronweb');
const ledgerService = require('./ledgerService');
const walletService = require('./walletService');
const { decrypt } = require('../utils/crypto');
const cron = require('node-cron');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Safe Supabase Initialization
let supabase;
if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
} else {
    console.warn('TronService: Supabase credentials missing. Using mock fallback.');
    supabase = {
        from: () => ({
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: null, error: null }) }) }),
            insert: async () => ({ error: null }),
            update: () => ({ eq: async () => ({ error: null }) })
        })
    };
}

// Tron Config
const TRON_FULL_NODE = 'https://nile.trongrid.io';
const TRON_SOLIDITY_NODE = 'https://nile.trongrid.io';
const TRON_EVENT_SERVER = 'https://nile.trongrid.io';

// Nile USDT Contract (Common Mock)
const NILE_USDT_CONTRACT = 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj'; 

// Safe Initialization of TronWeb
let tronWeb;
try {
    tronWeb = new TronWeb({
        fullNode: TRON_FULL_NODE,
        solidityNode: TRON_SOLIDITY_NODE,
        eventServer: TRON_EVENT_SERVER,
        // No private key needed for read-only operations
    });
} catch (e) {
    console.error('Failed to initialize TronWeb:', e);
    // Mock tronWeb to prevent crash, but operations will fail gracefully
    tronWeb = {
        transactionBuilder: {},
        trx: {
            sign: async () => { throw new Error('TronWeb not initialized'); },
            sendRawTransaction: async () => { throw new Error('TronWeb not initialized'); },
            getTransactionInfo: async () => { return null; }
        },
        toSun: (val) => val * 1000000
    };
}

class TronService {
    constructor() {
        this.isProcessing = false;
        this.usdtContractAddress = NILE_USDT_CONTRACT; 
    }

    startListener() {
        console.log('Starting TRON Real-Time Listener (Nile)...');
        
        // Poll for events every 5 seconds (simulating real-time listener)
        cron.schedule('*/5 * * * * *', () => this.checkDeposits());
    }

    async checkDeposits() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            // 1. Get all active deposit addresses (is_used = false)
            const { data: addresses, error } = await supabase
                .from('deposit_addresses')
                .select('*')
                .eq('is_used', false);
            
            if (error) {
                console.error('Tron Listener Error (DB Check):', error);
                throw error;
            }

            if (!addresses || addresses.length === 0) {
                this.isProcessing = false;
                return;
            }

            // 2. Check each address
            for (const addr of addresses) {
                await this.processAddress(addr);
            }

        } catch (error) {
            console.error('Tron Listener Error:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    async processAddress(addrData) {
        try {
            // Check TRC20 Transactions via TronGrid (Nile)
            const url = `https://nile.trongrid.io/v1/accounts/${addrData.tron_address}/transactions/trc20?contract_address=${this.usdtContractAddress}`;
            
            let transactions = [];
            try {
                const response = await fetch(url);
                const data = await response.json();
                transactions = data.data || [];
            } catch (fetchError) {
                console.error(`Error fetching transactions for ${addrData.tron_address}:`, fetchError);
                return;
            }

            // Filter for incoming USDT transactions
            const incomingTxs = transactions.filter(tx => tx.to === addrData.tron_address);

            for (const tx of incomingTxs) {
                await this.processTransaction(tx, addrData);
            }

        } catch (error) {
            console.error(`Error processing address ${addrData.tron_address}:`, error);
        }
    }

    async processTransaction(tx, addrData) {
        const txHash = tx.transaction_id;
        const amount = parseFloat(tx.value) / 1000000; // Assuming 6 decimals for USDT
        
        if (amount <= 0) {
             console.warn(`Skipping zero amount transaction: ${txHash}`);
             return;
        }

        const tokenSymbol = tx.token_info.symbol;
        const blockNumber = tx.block_timestamp; // Using timestamp as proxy if block_number missing
        
        // 1. Check if transaction already processed (Idempotency)
        const { data: existingTx } = await supabase
            .from('blockchain_transactions')
            .select('id, status')
            .eq('tx_hash', txHash)
            .maybeSingle();

        if (existingTx) {
            return;
        }

        console.log(`Detected new transaction: ${txHash} (${amount} ${tokenSymbol})`);

        // 2. Store transaction immediately as 'detected'
        const { error: insertError } = await supabase
            .from('blockchain_transactions')
            .insert({
                tx_hash: txHash,
                network: 'tron_nile',
                from_address: tx.from,
                to_address: tx.to,
                token_symbol: tokenSymbol,
                amount: amount,
                status: 'detected',
                user_id: addrData.user_id,
                block_number: blockNumber,
                created_at: new Date().toISOString()
            });

        if (insertError) {
            console.error('Error inserting blockchain transaction:', insertError);
            return;
        }

        // 3. Validation
        if (tokenSymbol !== 'USDT') {
             await supabase
                .from('blockchain_transactions')
                .update({ status: 'ignored' })
                .eq('tx_hash', txHash);
             console.warn(`Transaction ${txHash} ignored: Invalid Token Symbol`);
             return;
        }

        // 4. Expiry Check
        const now = new Date();
        const expiresAt = new Date(addrData.expires_at);
        const isExpired = now > expiresAt;

        if (isExpired) {
            console.warn(`Late deposit detected for user ${addrData.user_id} on address ${addrData.tron_address}`);
            
            // Mark as late_deposit
            await supabase
                .from('blockchain_transactions')
                .update({ status: 'late_deposit', processed_at: new Date().toISOString() })
                .eq('tx_hash', txHash);

            // Mark address as used to stop listening
            await supabase
                .from('deposit_addresses')
                .update({ is_used: true })
                .eq('id', addrData.id);
            
            // Sweep funds to treasury (Safety)
            this.triggerSweep(addrData, amount);
            return;
        }

        // 5. Valid Deposit - Credit User
        try {
            const success = await ledgerService.creditDeposit(addrData.user_id, amount, txHash, `Deposit ${amount} USDT`);
            
            if (success) {
                // Mark blockchain tx as credited
                await supabase
                    .from('blockchain_transactions')
                    .update({ status: 'credited', processed_at: new Date().toISOString() })
                    .eq('tx_hash', txHash);

                // Mark address as used
                await supabase
                    .from('deposit_addresses')
                    .update({ is_used: true })
                    .eq('id', addrData.id);

                console.log(`Credited ${amount} USDT to user ${addrData.user_id}`);

                // 6. Trigger Sweep
                await this.triggerSweep(addrData, amount);

            } else {
                console.error(`Failed to credit deposit for ${txHash}`);
                // Status remains 'detected' for manual review
            }
        } catch (ledgerError) {
            console.error('Ledger Credit Error:', ledgerError);
        }
    }

    async triggerSweep(addrData, amount) {
        try {
            const treasuryWallet = await walletService.getWallet('treasury');
            if (!treasuryWallet) {
                console.error('No treasury wallet found for sweep');
                return;
            }

            // Decrypt private key for temp address
            const privateKey = decrypt(addrData.private_key_encrypted);
            
            const sweepTxHash = await walletService.sweepFunds(
                addrData.tron_address, 
                privateKey, 
                amount, 
                treasuryWallet.address
            );

            if (sweepTxHash) {
                console.log(`Swept funds to treasury: ${sweepTxHash}`);
                
                // Update transaction with sweep hash
                await supabase
                    .from('blockchain_transactions')
                    .update({ 
                        sweep_tx_hash: sweepTxHash,
                        swept_at: new Date().toISOString()
                    })
                    .eq('to_address', addrData.tron_address)
                    .eq('status', 'credited'); 
            }
        } catch (error) {
            console.error('Sweep Trigger Error:', error);
            // Do not throw, so we don't rollback the credit
        }
    }

    async sendUSDT(toAddress, amount) {
        try {
            const treasuryWallet = await walletService.getWallet('treasury');
            if (!treasuryWallet) {
                throw new Error('Treasury wallet not configured');
            }

            console.log(`[TronService] Sending ${amount} USDT from Treasury (${treasuryWallet.address}) to ${toAddress}`);

            const amountInUnits = Math.floor(amount * 1000000); // 6 decimals for USDT

            // 1. Build Transaction (Trigger Smart Contract)
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
                treasuryWallet.address
            );

            if (!transaction.result || !transaction.result.result) {
                throw new Error('Failed to build USDT transfer transaction');
            }

            // 2. Sign Transaction
            const signedTx = await tronWeb.trx.sign(transaction.transaction, treasuryWallet.privateKey);

            // 3. Broadcast Transaction
            const broadcast = await tronWeb.trx.sendRawTransaction(signedTx);

            if (broadcast.result) {
                console.log(`[TronService] USDT Sent: ${broadcast.txid}`);
                return broadcast.txid;
            } else {
                console.error('[TronService] Broadcast failed:', broadcast);
                throw new Error('Broadcast failed: ' + JSON.stringify(broadcast));
            }

        } catch (error) {
            console.error('Send USDT Error:', error);
            throw error;
        }
    }

    async getTransactionInfo(txHash) {
        try {
            const info = await tronWeb.trx.getTransactionInfo(txHash);
            return info;
        } catch (error) {
            console.error(`Error getting transaction info for ${txHash}:`, error);
            return null;
        }
    }

    async checkConfirmation(txHash) {
        try {
            const info = await tronWeb.trx.getTransactionInfo(txHash);
            
            if (!info || !info.id) {
                // Not found yet (might be just broadcasted)
                return 'pending'; 
            }

            if (info.receipt && info.receipt.result === 'FAILED') {
                return 'failed';
            }
            
            if (info.receipt && info.receipt.result === 'SUCCESS') {
                // Check confirmations
                const currentBlock = await tronWeb.trx.getCurrentBlock();
                const currentBlockNum = currentBlock.block_header.raw_data.number;
                const txBlockNum = info.blockNumber;
                
                if ((currentBlockNum - txBlockNum) >= 19) {
                    return 'confirmed';
                } else {
                    return 'pending'; // Confirmed on chain but not enough confirmations
                }
            }
            
            return 'pending';
        } catch (error) {
            console.error(`Error checking confirmation for ${txHash}:`, error);
            return 'pending'; // Assume pending on error to retry
        }
    }
}

module.exports = new TronService();
