import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

// Nile Testnet USDT Contract
const NILE_USDT_CONTRACT = 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj';

interface TronWeb {
  ready: boolean;
  defaultAddress: {
    base58: string;
    hex: string;
  };
  trx: {
    getBalance: (address: string) => Promise<number>;
  };
  contract: () => {
    at: (address: string) => Promise<any>;
  };
}

declare global {
  interface Window {
    tronWeb: TronWeb;
    tronLink: {
        request: (args: { method: string }) => Promise<any>;
    };
  }
}

export function useTronWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<{ trx: number; usdt: number }>({ trx: 0, usdt: 0 });
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  const checkConnection = useCallback(async () => {
    if (window.tronWeb && window.tronWeb.ready && window.tronWeb.defaultAddress.base58) {
      setAddress(window.tronWeb.defaultAddress.base58);
      setConnected(true);
      await fetchBalances(window.tronWeb.defaultAddress.base58);
    } else {
      setConnected(false);
      setAddress(null);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
        checkConnection();
    }, 2000); // Poll for account changes

    // Listen for messages from TronLink
    window.addEventListener('message', (e) => {
        if (e.data.message && e.data.message.action === 'accountsChanged') {
            checkConnection();
        }
    });

    return () => clearInterval(interval);
  }, [checkConnection]);

  const fetchBalances = async (addr: string) => {
    try {
      // TRX Balance
      const trxBal = await window.tronWeb.trx.getBalance(addr);
      
      // USDT Balance (TRC20)
      let usdtBal = 0;
      try {
        const contract = await window.tronWeb.contract().at(NILE_USDT_CONTRACT);
        const balanceObj = await contract.balanceOf(addr).call();
        // Handle BigNumber result if returned, usually it's in sun/wei
        usdtBal = parseInt(balanceObj.toString()) / 1000000;
      } catch (e) {
        console.warn('Failed to fetch USDT balance (might be wrong network or contract)', e);
      }

      setBalance({
        trx: trxBal / 1000000,
        usdt: usdtBal
      });
    } catch (e) {
      console.error('Error fetching balances:', e);
    }
  };

  const connect = async () => {
    setLoading(true);
    try {
      if (window.tronLink) {
        const res = await window.tronLink.request({ method: 'tron_requestAccounts' });
        if (res.code === 200) {
            // Wait a moment for tronWeb to inject the new address
            setTimeout(() => checkConnection(), 500);
        } else {
            toast.error('Connection rejected');
        }
      } else {
        toast.error('TronLink not installed. Please install TronLink extension.');
        window.open('https://www.tronlink.org/', '_blank');
      }
    } catch (e) {
      console.error('Connection error:', e);
      toast.error('Failed to connect wallet');
    } finally {
      setLoading(false);
    }
  };

  const sendUSDT = async (toAddress: string, amount: number) => {
    if (!connected) throw new Error('Wallet not connected');
    
    try {
        const contract = await window.tronWeb.contract().at(NILE_USDT_CONTRACT);
        const amountInUnits = Math.floor(amount * 1000000);
        
        const txId = await contract.transfer(toAddress, amountInUnits).send({
            feeLimit: 100000000 // 100 TRX limit
        });
        
        return txId;
    } catch (e: any) {
        console.error('Send USDT Error:', e);
        throw new Error(e.message || 'Transaction failed');
    }
  };

  return {
    address,
    balance,
    connected,
    loading,
    connect,
    sendUSDT,
    refresh: () => address && fetchBalances(address)
  };
}
