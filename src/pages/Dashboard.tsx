import { useAuth } from '@/lib/auth';
import { useTronWallet } from '@/hooks/useTronWallet';
import { AppLayout } from '@/components/layout/AppLayout';
import { CardSkeleton } from '@/components/ui/LoadingSkeleton';
import { 
  Copy, ExternalLink, RefreshCw, Wallet, Building2, TrendingUp, 
  Clock, ArrowUpRight, ArrowDownRight, Coins, Shield, Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface RecentActivity {
  id: string;
  type: 'deposit' | 'salary' | 'withdrawal';
  amount: number;
  status: string;
  created_at: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { connected, balance: walletBalance, refresh } = useTronWallet();
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  const displayBalance = connected ? walletBalance.usdt : 0;

  useEffect(() => {
    const fetchRecentActivity = async () => {
      if (!user?.id) return;
      
      const { data } = await supabase
        .from('transactions')
        .select('id, type, amount, status, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (data) {
        const dbActivity = data.map(item => ({
          ...item,
          type: item.type as 'deposit' | 'salary' | 'withdrawal',
        }));

        setRecentActivity(dbActivity);
      }
      setActivityLoading(false);
    };

    fetchRecentActivity();
  }, [user?.id]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const shortenAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'deposit':
        return <ArrowDownRight className="w-4 h-4" />;
      case 'salary':
        return <Coins className="w-4 h-4" />;
      case 'withdrawal':
        return <ArrowUpRight className="w-4 h-4" />;
      default:
        return <Coins className="w-4 h-4" />;
    }
  };

  return (
    <AppLayout>
      <div className="animate-fade-in">
        {/* Hero Section */}
        <div className="relative mb-8 p-8 rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground overflow-hidden">
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-5 h-5" />
              <span className="text-sm font-medium opacity-90">Welcome back</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">{user?.account_holder_name}</h1>
            <p className="text-sm opacity-75">Your crypto payroll dashboard</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 relative overflow-hidden rounded-2xl border border-border bg-card p-8">
              <div className="absolute top-0 right-0 w-40 h-40 bg-muted/30 rounded-full -translate-y-1/2 translate-x-1/2" />
              
              <div className="relative">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-primary text-primary-foreground">
                      <Wallet className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Available Balance</p>
                      <p className="text-xs text-muted-foreground">Real-time from TronLink wallet</p>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="rounded-full"
                    onClick={refresh}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>

                <div className="mb-6">
                  <div className="flex items-baseline gap-3">
                    <span className="text-5xl md:text-6xl font-bold tracking-tight">
                      {displayBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-2xl text-muted-foreground font-medium">USDT</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-6">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-xs text-muted-foreground">{connected ? 'Connected to TRON Wallet' : 'Wallet not connected'}</span>
                </div>
              </div>
            </div>

          {/* Quick Stats */}
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 hover:border-primary/50 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-muted">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">This Month</span>
              </div>
              <p className="text-2xl font-bold">+{displayBalance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} USDT</p>
              <p className="text-xs text-muted-foreground mt-1">Total received</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 hover:border-primary/50 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Security</span>
              </div>
              <p className="text-lg font-semibold">Protected</p>
              <p className="text-xs text-muted-foreground mt-1">256-bit encryption</p>
            </div>
          </div>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Bank Details Card */}
          <div className="rounded-xl border border-border bg-card p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 rounded-xl bg-muted">
                <Building2 className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">Bank Account</h3>
                <p className="text-xs text-muted-foreground">Linked for exchanges</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-dashed border-border">
                <span className="text-sm text-muted-foreground">Account Holder</span>
                <span className="font-medium">{user?.account_holder_name}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-dashed border-border">
                <span className="text-sm text-muted-foreground">Account Number</span>
                <span className="font-mono text-sm">{user?.account_number}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-muted-foreground">IFSC Code</span>
                <span className="font-mono text-sm">{user?.ifsc_code}</span>
              </div>
            </div>
          </div>

          {/* Wallet Info Card */}
          <div className="rounded-xl border border-border bg-card p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 rounded-xl bg-muted">
                <Wallet className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">TRON Wallet</h3>
                <p className="text-xs text-muted-foreground">TRC20 Network</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-2">Wallet Address</p>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                  <code className="text-sm font-mono flex-1 truncate">
                    {user?.tron_wallet_address || 'Not assigned'}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => copyToClipboard(user?.tron_wallet_address || '')}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              <a
                href={`https://tronscan.org/#/address/${user?.tron_wallet_address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-border hover:bg-muted transition-colors text-sm font-medium"
              >
                View on TronScan (Nile Testnet)
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>

        {/* Recent Activity & Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Recent Activity */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold">Recent Activity</h3>
              <a href="/transactions" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                View all
              </a>
            </div>
            
            {activityLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
                ))}
              </div>
            ) : recentActivity.length === 0 ? (
              <div className="text-center py-8">
                <Coins className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No transactions yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div 
                    key={activity.id} 
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        activity.type === 'salary' ? 'bg-green-500/10 text-green-600' :
                        activity.type === 'deposit' ? 'bg-blue-500/10 text-blue-600' :
                        'bg-orange-500/10 text-orange-600'
                      }`}>
                        {getActivityIcon(activity.type)}
                      </div>
                      <div>
                        <p className="font-medium capitalize">
                          {activity.type === 'withdrawal' ? 'exchange' : activity.type}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatTimeAgo(activity.created_at)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${
                        activity.type === 'withdrawal' ? 'text-muted-foreground' : ''
                      }`}>
                        {activity.type === 'withdrawal' ? '-' : '+'}
                        {activity.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-muted-foreground">USDT</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="font-semibold mb-5">Quick Actions</h3>
            
            <div className="space-y-3">
              <a
                href="/deposit"
                className="flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary hover:bg-muted/30 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-green-500/10 text-green-600 group-hover:bg-green-500 group-hover:text-white transition-colors">
                    <ArrowDownRight className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-medium">Deposit USDT</h4>
                    <p className="text-sm text-muted-foreground">Add funds to your wallet</p>
                  </div>
                </div>
                <ArrowUpRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </a>
              
              <a
                href="/withdraw"
                className="flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary hover:bg-muted/30 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-medium">Exchange to Bank</h4>
                    <p className="text-sm text-muted-foreground">Convert USDT to INR</p>
                  </div>
                </div>
                <ArrowUpRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </a>
              
              <a
                href="/transactions"
                className="flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary hover:bg-muted/30 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-purple-500/10 text-purple-600 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                    <Coins className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-medium">Transaction History</h4>
                    <p className="text-sm text-muted-foreground">View all transactions</p>
                  </div>
                </div>
                <ArrowUpRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </a>
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <div className="rounded-xl border border-border bg-muted/30 p-5 flex items-start gap-4">
          <div className="p-2 rounded-lg bg-primary text-primary-foreground shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-medium mb-1">Bank-Grade Security</h4>
            <p className="text-sm text-muted-foreground">
              Your wallet private keys are encrypted with AES-256. Bank details are stored securely and cannot be modified for compliance. All transactions are verifiable on TronScan.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
