import { Button } from "@/components/ui/button";
import { Wallet, Loader2 } from "lucide-react";
import { useTronWallet } from "@/hooks/useTronWallet";

interface WalletConnectProps {
  onConnect?: () => void;
  className?: string;
}

export function WalletConnect({ onConnect, className }: WalletConnectProps) {
  const { connected, address, balance, loading, connect } = useTronWallet();

  const handleConnect = async () => {
    await connect();
    if (onConnect) onConnect();
  };

  if (loading) {
    return (
      <Button disabled variant="outline" className={className}>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Connecting...
      </Button>
    );
  }

  if (connected && address) {
    return (
      <div className={`flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-lg border border-primary/20 ${className}`}>
        <div className="p-1.5 bg-primary/20 rounded-full">
            <Wallet className="h-4 w-4 text-primary" />
        </div>
        <div className="flex flex-col">
            <span className="text-xs font-medium text-muted-foreground">Connected</span>
            <span className="text-sm font-semibold font-mono">
                {address.slice(0, 6)}...{address.slice(-4)}
            </span>
        </div>
        <div className="ml-2 pl-3 border-l border-border flex flex-col items-end">
             <span className="text-xs font-medium">{balance.usdt.toFixed(2)} USDT</span>
             <span className="text-[10px] text-muted-foreground">{balance.trx.toFixed(2)} TRX</span>
        </div>
      </div>
    );
  }

  return (
    <Button onClick={handleConnect} variant="outline" className={`gap-2 ${className}`}>
      <Wallet className="h-4 w-4" />
      Connect Wallet
    </Button>
  );
}
