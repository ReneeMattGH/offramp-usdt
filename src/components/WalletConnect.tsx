import { Button } from "@/components/ui/button";
import { Wallet, Loader2, Link as LinkIcon } from "lucide-react";
import { useTronWallet } from "@/hooks/useTronWallet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";

interface WalletConnectProps {
  onConnect?: () => void;
  className?: string;
}

export function WalletConnect({ onConnect, className }: WalletConnectProps) {
  const { connected, address, balance, loading, connect, network } = useTronWallet();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'tronlink' | 'address'>('tronlink');
  const [manualNetwork] = useState<'mainnet'>('mainnet');
  const [manualAddress, setManualAddress] = useState('');
  const [manualBalance, setManualBalance] = useState<{ usdt: number; trx: number }>({ usdt: 0, trx: 0 });
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [manualConnected, setManualConnected] = useState(false);

  const handleConnect = async () => {
    setIsOpen(true);
  };

  useEffect(() => {
    if (connected && address) setIsOpen(false);
  }, [connected, address]);

  const startTronLink = async () => {
    await connect();
    if (onConnect) onConnect?.();
  };

  const getApiBase = () => {
    return 'https://api.trongrid.io';
  };

  const getUsdtContract = () => {
    return 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  };

  const fetchManualBalance = async () => {
    if (!manualAddress || !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(manualAddress)) {
      setFetchError('Enter a valid TRON address');
      return;
    }
    setIsFetching(true);
    setFetchError(null);
    try {
      const api = getApiBase();
      const usdtRes = await fetch(`${api}/v1/accounts/${manualAddress}/tokens?limit=100`, { headers: { Accept: 'application/json' } });
      if (!usdtRes.ok) throw new Error('Failed to fetch tokens');
      const usdtJson = await usdtRes.json();
      const usdt = (usdtJson?.data || []).find((t: any) => t.tokenId === getUsdtContract() || t.tokenAbbr === 'USDT');
      const usdtBal = usdt ? parseFloat(usdt.balance) / 1_000_000 : 0;

      const accRes = await fetch(`${api}/v1/accounts/${manualAddress}`, { headers: { Accept: 'application/json' } });
      let trxBal = 0;
      if (accRes.ok) {
        const accJson = await accRes.json();
        const account = Array.isArray(accJson?.data) ? accJson.data[0] : accJson;
        const raw = account?.balance ?? 0;
        trxBal = typeof raw === 'string' ? parseFloat(raw) / 1_000_000 : raw / 1_000_000;
      }

      setManualBalance({ usdt: usdtBal, trx: trxBal });
      setManualConnected(true);
    } catch (e: any) {
      setFetchError(e.message || 'Failed to fetch balance');
    } finally {
      setIsFetching(false);
    }
  };

  if (loading) {
    return (
      <Button disabled variant="outline" className={className}>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Connecting...
      </Button>
    );
  }

  if ((connected && address) || manualConnected) {
    const showAddress = connected ? address! : manualAddress;
    const showBalance = connected ? balance : manualBalance;
    const showNetwork = connected ? network : manualNetwork;
    return (
      <div className={`flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-lg border border-primary/20 ${className}`}>
        <div className="p-1.5 bg-primary/20 rounded-full">
            <Wallet className="h-4 w-4 text-primary" />
        </div>
        <div className="flex flex-col">
            <span className="text-xs font-medium text-muted-foreground">Connected</span>
            <span className="text-sm font-semibold font-mono">
                {showAddress.slice(0, 6)}...{showAddress.slice(-4)}
            </span>
        </div>
        <div className="ml-2 pl-3 border-l border-border flex flex-col items-end">
             <span className="text-xs font-medium">{showBalance.usdt.toFixed(2)} USDT</span>
             <span className="text-[10px] text-muted-foreground">{showBalance.trx.toFixed(2)} TRX</span>
             <span className="text-[10px] text-muted-foreground">{showNetwork === 'mainnet' ? 'Mainnet' : 'Unknown'}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <Button onClick={handleConnect} variant="outline" className={`gap-2 ${className}`}>
        <Wallet className="h-4 w-4" />
        Connect Wallet
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect TRON Wallet</DialogTitle>
            <DialogDescription>Choose a connection method and view real-time balances</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <Button variant={mode === 'tronlink' ? 'default' : 'outline'} onClick={() => setMode('tronlink')}>
              <Wallet className="h-4 w-4 mr-2" />
              TronLink
            </Button>
            <Button variant={mode === 'address' ? 'default' : 'outline'} onClick={() => setMode('address')}>
              <LinkIcon className="h-4 w-4 mr-2" />
              Enter Address
            </Button>
          </div>

          {mode === 'tronlink' ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Connect using the TronLink browser extension</p>
              <div className="flex items-center gap-2">
                <Button onClick={startTronLink} className="gap-2">
                  <Wallet className="h-4 w-4" />
                  Connect TronLink
                </Button>
                <a
                  href="https://www.tronlink.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground underline"
                >
                  Install TronLink
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Input
                placeholder="Enter TRON address (starts with T...)"
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value.trim())}
              />
              <div className="flex items-center gap-2">
                <Button onClick={fetchManualBalance} disabled={isFetching} className="gap-2">
                  {isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
                  Fetch Balance
                </Button>
                {fetchError && <span className="text-xs text-destructive">{fetchError}</span>}
              </div>
              {manualConnected && (
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="text-xs">
                    <div className="font-mono">{manualAddress.slice(0, 10)}...</div>
                    <div className="text-muted-foreground">Mainnet</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">{manualBalance.usdt.toFixed(4)} USDT</div>
                    <div className="text-xs text-muted-foreground">{manualBalance.trx.toFixed(4)} TRX</div>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
