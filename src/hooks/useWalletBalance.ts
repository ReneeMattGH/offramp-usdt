import { useState, useEffect, useCallback } from 'react';

const TRONGRID_API = 'https://api.trongrid.io';
const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // USDT TRC20 contract

interface WalletBalance {
  balance: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useWalletBalance(walletAddress: string | null): WalletBalance {
  const [balance, setBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!walletAddress) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch USDT TRC20 balance using TronGrid API
      const response = await fetch(
        `${TRONGRID_API}/v1/accounts/${walletAddress}/tokens?limit=100`,
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch balance');
      }

      const data = await response.json();
      
      // Find USDT token in the response
      const usdtToken = data?.data?.find(
        (token: any) => token.tokenId === USDT_CONTRACT || token.tokenAbbr === 'USDT'
      );

      if (usdtToken) {
        // USDT has 6 decimals
        const usdtBalance = parseFloat(usdtToken.balance) / 1000000;
        setBalance(usdtBalance);
      } else {
        setBalance(0);
      }
    } catch (err: any) {
      console.error('Error fetching balance:', err);
      setError(err.message || 'Failed to fetch balance');
      // Set a mock balance for demo purposes when API fails
      setBalance(0);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchBalance();
    
    // Poll for balance updates every 30 seconds
    const interval = setInterval(fetchBalance, 30000);
    
    return () => clearInterval(interval);
  }, [fetchBalance]);

  return { balance, isLoading, error, refetch: fetchBalance };
}
