import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useUserBalance } from '@/hooks/useUserBalance';
import { AppLayout } from '@/components/layout/AppLayout';
import { AlertCircle, ArrowRight, Wallet, History, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

interface Withdrawal {
  id: string;
  destination_address: string;
  usdt_amount: number;
  fee: number;
  net_amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  tx_hash?: string;
  created_at: string;
  failure_reason?: string;
}

export default function WithdrawUSDT() {
  const { user, sessionToken } = useAuth();
  const { balance, lockedBalance, isLoading: balanceLoading, refetch: refetchBalance } = useUserBalance();
  
  const [destinationAddress, setDestinationAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [config, setConfig] = useState<any>(null);
  const [dailyUsage, setDailyUsage] = useState(0);

  const fee = 5.0;
  const minWithdrawal = 20.0;

  // Initialize Idempotency Key & Fetch Config
  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
    
    fetch('/api/config/public')
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(err => console.error('Failed to fetch config', err));
  }, []);

  // Fetch Withdrawal History
  const fetchWithdrawals = async () => {
    try {
      setLoadingHistory(true);
      const response = await fetch('/api/withdrawals/usdt', {
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
      });
      const data = await response.json();

      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        localStorage.removeItem('token');
        window.location.href = '/login';
        return;
      }

      if (Array.isArray(data)) {
        setWithdrawals(data);
        
        // Calculate Daily Usage
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const usedToday = data
            .filter((w: Withdrawal) => {
                const wDate = new Date(w.created_at);
                return wDate >= today && w.status !== 'failed' && w.status !== 'refunded';
            })
            .reduce((sum: number, w: Withdrawal) => sum + (Number(w.usdt_amount) || 0), 0);
            
        setDailyUsage(usedToday);
      }
    } catch (error) {
      console.error('Failed to fetch withdrawals', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchWithdrawals();
    const interval = setInterval(fetchWithdrawals, 10000);
    return () => clearInterval(interval);
  }, [sessionToken]);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !destinationAddress) return;

    const val = parseFloat(amount);
    if (isNaN(val) || val < minWithdrawal) {
      toast.error(`Minimum withdrawal is ${minWithdrawal} USDT`);
      return;
    }

    if (val + fee > (balance || 0)) {
      toast.error('Insufficient balance (Amount + Fee)');
      return;
    }

    if (!destinationAddress.startsWith('T') || destinationAddress.length !== 34) {
      // Basic TRON address check (starts with T, 34 chars) - not perfect but good for basic validation
      toast.warning('Please verify the TRON address format (Starts with T, usually 34 chars)');
      // We don't block strictly here, let backend validate or TronWeb handle it, but good to warn
    }

    if (config?.usdt_withdrawals_paused) {
      toast.error('USDT Withdrawals are currently paused by admin.');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch('/api/withdraw/usdt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify({ 
          destination_address: destinationAddress,
          amount: val
        })
      });

      const result = await response.json();

      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        localStorage.removeItem('token');
        window.location.href = '/login';
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || 'Withdrawal failed');
      }

      toast.success('Withdrawal Request Submitted!');
      setAmount('');
      setDestinationAddress('');
      setIdempotencyKey(crypto.randomUUID()); // Reset key for next request
      refetchBalance();
      fetchWithdrawals();
      
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'refunded': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <AppLayout>
      <div className="animate-fade-in max-w-4xl mx-auto space-y-8">
        
        {config?.usdt_withdrawals_paused && (
            <div className="bg-red-100 border border-red-200 text-red-800 px-4 py-3 rounded relative">
                <strong className="font-bold">Withdrawals Paused!</strong>
                <span className="block sm:inline"> USDT withdrawals are temporarily disabled by the administrator.</span>
            </div>
        )}

        {/* Header */}
        <div>
          <h1 className="page-header">Withdraw USDT</h1>
          <p className="page-description mt-1">
            Send USDT (TRC20) to an external wallet securely.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
            
            {/* Left Column: Withdrawal Form */}
            <div className="space-y-6">
                
                {/* Balance Card */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Available Balance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-bold">
                                {balanceLoading ? '...' : balance?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                            <span className="text-sm font-medium text-muted-foreground">USDT</span>
                        </div>
                        {lockedBalance && lockedBalance > 0 ? (
                             <div className="mt-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded flex items-center gap-1 w-fit">
                                <AlertCircle className="w-3 h-3" />
                                Locked: {lockedBalance} USDT
                            </div>
                        ) : null}
                    </CardContent>
                </Card>

                {/* Form */}
                <Card>
                    <CardHeader>
                        <CardTitle>Request Withdrawal</CardTitle>
                        <CardDescription>
                          Min: {minWithdrawal} USDT | Fee: {fee} USDT
                          {config?.limits && (
                              <div className="mt-2 text-xs p-2 bg-muted rounded-md">
                                  <div className="flex justify-between mb-1">
                                      <span>Daily Limit:</span>
                                      <span>{dailyUsage.toLocaleString()} / {config.limits.daily_withdrawal_usdt.toLocaleString()} USDT</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-700">
                                      <div 
                                        className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" 
                                        style={{ width: `${Math.min((dailyUsage / config.limits.daily_withdrawal_usdt) * 100, 100)}%` }}
                                      ></div>
                                  </div>
                              </div>
                          )}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleWithdraw} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="address">Destination Address (TRC20)</Label>
                                <Input 
                                    id="address" 
                                    placeholder="T..." 
                                    value={destinationAddress}
                                    onChange={(e) => setDestinationAddress(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="amount">Amount (USDT)</Label>
                                <Input 
                                    id="amount" 
                                    type="number" 
                                    placeholder="0.00" 
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    min={minWithdrawal}
                                    step="0.01"
                                />
                            </div>

                            {/* Summary */}
                            <div className="bg-muted p-3 rounded-md space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Withdrawal Amount:</span>
                                    <span>{amount ? parseFloat(amount).toFixed(2) : '0.00'} USDT</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Network Fee:</span>
                                    <span>{fee.toFixed(2)} USDT</span>
                                </div>
                                <div className="border-t border-muted-foreground/20 my-1 pt-1 flex justify-between font-medium">
                                    <span>Total Deduction:</span>
                                    <span>{amount ? (parseFloat(amount) + fee).toFixed(2) : '0.00'} USDT</span>
                                </div>
                            </div>

                            <Button 
                                type="submit" 
                                className="w-full" 
                                disabled={isSubmitting || !amount || !destinationAddress}
                            >
                                {isSubmitting ? 'Processing...' : 'Withdraw USDT'}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>

            {/* Right Column: History */}
            <div className="space-y-6">
                <Card className="h-full flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <History className="w-5 h-5" />
                            Recent Withdrawals
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-auto max-h-[600px] pr-2">
                        {loadingHistory && withdrawals.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">Loading...</div>
                        ) : withdrawals.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">No withdrawals yet.</div>
                        ) : (
                            <div className="space-y-4">
                                {withdrawals.map((w) => (
                                    <div key={w.id} className="border rounded-lg p-3 space-y-2">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="font-medium">{w.usdt_amount} USDT</div>
                                                <div className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleString()}</div>
                                            </div>
                                            <Badge variant="secondary" className={getStatusColor(w.status)}>
                                                {w.status.toUpperCase()}
                                            </Badge>
                                        </div>
                                        
                                        <div className="text-xs text-muted-foreground break-all">
                                            To: {w.destination_address.slice(0, 6)}...{w.destination_address.slice(-4)}
                                        </div>

                                        {w.tx_hash && (
                                            <a 
                                                href={`https://tronscan.org/#/transaction/${w.tx_hash}`} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-xs flex items-center gap-1 text-blue-600 hover:underline"
                                            >
                                                View on TronScan <ExternalLink className="w-3 h-3" />
                                            </a>
                                        )}
                                        
                                        {w.failure_reason && (
                                            <div className="text-xs text-red-600 mt-1">
                                                Error: {w.failure_reason}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
      </div>
    </AppLayout>
  );
}
