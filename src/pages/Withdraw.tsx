import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useUserBalance } from '@/hooks/useUserBalance';
import { AppLayout } from '@/components/layout/AppLayout';
import { AlertCircle, ArrowRight, Banknote, Shield, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ExchangeHistory } from '@/components/ExchangeHistory';

export default function Withdraw() {
  const { user, sessionToken } = useAuth();
  const { balance, lockedBalance, isLoading: balanceLoading, refetch: refetchBalance } = useUserBalance();
  
  const [rate, setRate] = useState<number | null>(null);
  const [usdtAmount, setUsdtAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingRate, setLoadingRate] = useState(false);

  // Fetch Rate
  const fetchRate = async () => {
    try {
      setLoadingRate(true);
      const response = await fetch('http://localhost:3000/api/exchange/rate');
      const data = await response.json();
      if (data.rate) {
        setRate(data.rate);
      }
    } catch (error) {
      console.error('Failed to fetch rate', error);
      toast.error('Failed to fetch exchange rate');
    } finally {
      setLoadingRate(false);
    }
  };

  useEffect(() => {
    fetchRate();
    const interval = setInterval(fetchRate, 10000); // Update rate every 10s
    return () => clearInterval(interval);
  }, []);

  const handleExchange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usdtAmount || !rate) return;

    const amount = parseFloat(usdtAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Invalid amount');
      return;
    }

    if (amount > (balance || 0)) {
      toast.error('Insufficient balance');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch('http://localhost:3000/api/exchange/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ usdt_amount: amount })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Exchange failed');
      }

      toast.success(`Exchange Order Created! Order ID: ${result.order_id}`);
      setUsdtAmount('');
      refetchBalance();
      // ExchangeHistory component will auto-refresh via its own polling
      
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (user?.kyc_status !== 'approved') {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
          <Shield className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Verification Required</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            Please complete your identity verification (KYC) in Settings to access withdrawals.
          </p>
          <Link to="/settings">
            <Button>Go to Settings</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  const calculatedInr = usdtAmount && rate ? (parseFloat(usdtAmount) * rate).toFixed(2) : '0.00';

  return (
    <AppLayout>
      <div className="animate-fade-in max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div>
          <h1 className="page-header">Exchange USDT to INR</h1>
          <p className="page-description mt-1">
            Convert your USDT to INR and withdraw directly to your bank account.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
            
            {/* Left Column: Exchange Form */}
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

                {/* Exchange Rate Card */}
                <Card>
                    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Current Rate</CardTitle>
                        <RefreshCcw className={`w-4 h-4 text-muted-foreground ${loadingRate ? 'animate-spin' : ''}`} />
                    </CardHeader>
                    <CardContent>
                         <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-bold text-green-600">
                                ₹{rate ? rate.toFixed(2) : '...'}
                            </span>
                            <span className="text-sm font-medium text-muted-foreground">/ USDT</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Rates update every 10 seconds</p>
                    </CardContent>
                </Card>

                {/* Exchange Input Form */}
                <Card>
                    <CardHeader>
                        <CardTitle>Create Order</CardTitle>
                        <CardDescription>Enter USDT amount to exchange</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleExchange} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="usdt">You Send (USDT)</Label>
                                <Input 
                                    id="usdt" 
                                    type="number" 
                                    placeholder="0.00" 
                                    value={usdtAmount}
                                    onChange={(e) => setUsdtAmount(e.target.value)}
                                    min="1"
                                    step="0.01"
                                />
                            </div>

                            <div className="flex justify-center">
                                <ArrowRight className="text-muted-foreground rotate-90 md:rotate-0" />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="inr">You Receive (INR)</Label>
                                <div className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50">
                                    ₹ {calculatedInr}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Includes all fees. Sent to your verified bank account.
                                </p>
                            </div>

                            <Button 
                                type="submit" 
                                className="w-full" 
                                disabled={isSubmitting || !rate || !usdtAmount || parseFloat(usdtAmount) <= 0}
                            >
                                {isSubmitting ? 'Processing...' : 'Exchange & Withdraw'}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

            </div>

            {/* Right Column: History */}
            <div>
                 <ExchangeHistory />
            </div>

        </div>
      </div>
    </AppLayout>
  );
}
