import { useAuth } from '@/lib/auth';
import { useUserBalance } from '@/hooks/useUserBalance';
import { useDepositAddress } from '@/hooks/useDepositAddress';
import { AppLayout } from '@/components/layout/AppLayout';
import { Link } from 'react-router-dom';
import { Copy, ExternalLink, AlertCircle, RefreshCw, Clock, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import QRCode from 'react-qr-code';

export default function Deposit() {
  const { user, isLoading: authLoading } = useAuth();
  const { balance, isLoading: balanceLoading, refetch } = useUserBalance();
  const { 
    address: depositAddress, 
    timeRemaining, 
    formatTimeRemaining, 
    isLoading: addressLoading,
    refresh: refreshAddress 
  } = useDepositAddress();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Wallet address copied to clipboard');
  };

  const isLoading = addressLoading;

  if (authLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (user?.kyc_status !== 'approved') {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
          <Shield className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Verification Required</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            Please complete your identity verification (KYC) in Settings to access deposits.
          </p>
          <Link to="/settings">
            <Button>Go to Settings</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="animate-fade-in max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="page-header">Deposit USDT</h1>
          <p className="page-description mt-1">
            Send USDT (TRC20) to your wallet address below
          </p>
        </div>

        {/* Balance Card */}
        <div className="stat-card mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Current Balance</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold">
                  {balanceLoading ? '...' : balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-muted-foreground">USDT</span>
              </div>
              <p className="text-xs text-green-600 mt-1 animate-pulse">
                 Live updates active
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={refetch} disabled={balanceLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${balanceLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Address Expiry Timer */}
        <div className="bg-muted rounded-lg p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Address expires in</p>
              <p className="text-2xl font-mono font-bold">{formatTimeRemaining()}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={refreshAddress} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            New Address
          </Button>
        </div>

        {/* QR Code & Address */}
        <div className="stat-card mb-8">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            {/* QR Code */}
            <div className="flex justify-center">
              <div className="p-6 bg-background border border-border rounded-xl">
                {isLoading ? (
                  <div className="w-[180px] h-[180px] flex items-center justify-center">
                    <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                ) : depositAddress ? (
                  <QRCode 
                    value={depositAddress} 
                    size={180}
                    level="H"
                    style={{ height: 'auto', maxWidth: '100%', width: '100%' }}
                  />
                ) : null}
              </div>
            </div>

            {/* Address & Instructions */}
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-2">
                  Your TRON Deposit Address
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono bg-muted px-3 py-2.5 rounded-md break-all">
                    {isLoading ? 'Loading...' : depositAddress}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(depositAddress)}
                    disabled={isLoading || !depositAddress}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <a
                href={`https://nile.tronscan.org/#/address/${depositAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                View on TronScan (Nile Testnet)
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>

        {/* Important Notice */}
        <div className="bg-muted rounded-lg p-4 mb-8">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium mb-1">Important Instructions</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Send only USDT (TRC20) to this address</li>
                <li>• Minimum deposit: 1 USDT</li>
                <li>• <strong>Address changes every 30 minutes</strong> — use before it expires</li>
                <li>• Deposits are auto-detected within 1-3 minutes</li>
                <li>• Other tokens sent to this address may be lost</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Network Info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="stat-card">
            <p className="text-xs text-muted-foreground mb-1">Network</p>
            <p className="font-medium">TRON (TRC20)</p>
          </div>
          <div className="stat-card">
            <p className="text-xs text-muted-foreground mb-1">Token</p>
            <p className="font-medium">USDT</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
