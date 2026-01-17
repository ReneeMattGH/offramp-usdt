import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { TableRowSkeleton } from '@/components/ui/LoadingSkeleton';
import { ExternalLink, RefreshCw, Receipt, Coins, ArrowDownRight, ArrowUpRight, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Transaction {
  id: string;
  type: 'deposit' | 'salary' | 'withdrawal';
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  tx_hash: string | null;
  created_at: string;
}

interface SalaryTransaction {
  id: string;
  from_address: string;
  to_address: string;
  amount_usdt: number;
  tx_hash: string | null;
  status: string;
  block_number: number | null;
  created_at: string;
  confirmed_at: string | null;
}

export default function Transactions() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [salaryTransactions, setSalaryTransactions] = useState<SalaryTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [salaryLoading, setSalaryLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  const fetchTransactions = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const typedData = (data || []).map(item => ({
        ...item,
        type: item.type as 'deposit' | 'salary' | 'withdrawal',
        status: item.status as 'pending' | 'processing' | 'completed' | 'failed',
      }));
      
      setTransactions(typedData);
    } catch (err) {
      console.error('Error fetching transactions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSalaryTransactions = async () => {
    if (!user) return;
    
    setSalaryLoading(true);
    try {
      const { data, error } = await supabase
        .from('salary_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSalaryTransactions(data || []);
    } catch (err) {
      console.error('Error fetching salary transactions:', err);
    } finally {
      setSalaryLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
    fetchSalaryTransactions();
    
    // Set up real-time subscriptions
    const txChannel = supabase
      .channel('transactions-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${user?.id}`,
        },
        () => fetchTransactions()
      )
      .subscribe();

    const salaryChannel = supabase
      .channel('salary-transactions-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'salary_transactions',
          filter: `user_id=eq.${user?.id}`,
        },
        () => fetchSalaryTransactions()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(txChannel);
      supabase.removeChannel(salaryChannel);
    };
  }, [user?.id]);

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-amber-500/10 text-amber-600 border border-amber-500/20',
      initiated: 'bg-amber-500/10 text-amber-600 border border-amber-500/20',
      processing: 'bg-blue-500/10 text-blue-600 border border-blue-500/20',
      broadcasted: 'bg-blue-500/10 text-blue-600 border border-blue-500/20',
      completed: 'bg-green-500/10 text-green-600 border border-green-500/20',
      confirmed: 'bg-green-500/10 text-green-600 border border-green-500/20',
      failed: 'bg-red-500/10 text-red-600 border border-red-500/20',
    };
    
    return (
      <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium', styles[status] || styles.pending)}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getTypeIcon = (type: string) => {
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

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'deposit':
        return 'bg-blue-500/10 text-blue-600';
      case 'salary':
        return 'bg-green-500/10 text-green-600';
      case 'withdrawal':
        return 'bg-orange-500/10 text-orange-600';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const shortenHash = (hash: string) => {
    if (!hash) return '—';
    return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
  };

  const shortenAddress = (address: string) => {
    if (!address) return '—';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Calculate stats
  const totalDeposits = transactions
    .filter(t => t.type === 'deposit' && t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const totalSalary = salaryTransactions
    .filter(t => t.status === 'confirmed')
    .reduce((sum, t) => sum + t.amount_usdt, 0);
  
  const totalWithdrawals = transactions
    .filter(t => t.type === 'withdrawal' && t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0);

  const pendingSalary = salaryTransactions
    .filter(t => t.status === 'initiated' || t.status === 'broadcasted')
    .reduce((sum, t) => sum + t.amount_usdt, 0);

  return (
    <AppLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="page-header">Transactions</h1>
            <p className="page-description mt-1">View your complete transaction history</p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => { fetchTransactions(); fetchSalaryTransactions(); }} 
            disabled={isLoading || salaryLoading}
          >
            <RefreshCw className={cn('w-4 h-4 mr-2', (isLoading || salaryLoading) && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-green-500/10">
                <Coins className="w-4 h-4 text-green-600" />
              </div>
              <span className="text-xs text-muted-foreground">Total Salary</span>
            </div>
            <p className="text-xl font-bold">{totalSalary.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-muted-foreground">USDT received</p>
          </div>
          
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-blue-500/10">
                <ArrowDownRight className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-xs text-muted-foreground">Total Deposits</span>
            </div>
            <p className="text-xl font-bold">{totalDeposits.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-muted-foreground">USDT deposited</p>
          </div>
          
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-orange-500/10">
                <ArrowUpRight className="w-4 h-4 text-orange-600" />
              </div>
              <span className="text-xs text-muted-foreground">Total Exchanges</span>
            </div>
            <p className="text-xl font-bold">{totalWithdrawals.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-muted-foreground">USDT exchanged</p>
          </div>
          
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10">
                <Receipt className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-xs text-muted-foreground">Pending</span>
            </div>
            <p className="text-xl font-bold">{pendingSalary.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-muted-foreground">USDT pending</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="all" className="data-[state=active]:bg-background">
              All Transactions
            </TabsTrigger>
            <TabsTrigger value="salary" className="data-[state=active]:bg-background">
              Salary History
            </TabsTrigger>
          </TabsList>

          {/* All Transactions Tab */}
          <TabsContent value="all" className="mt-0">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr className="bg-muted/30">
                      <th className="pl-6">Type</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date & Time</th>
                      <th className="pr-6">Transaction Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <>
                        <TableRowSkeleton />
                        <TableRowSkeleton />
                        <TableRowSkeleton />
                      </>
                    ) : transactions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-16">
                          <Receipt className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground font-medium">No transactions yet</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Your transactions will appear here
                          </p>
                        </td>
                      </tr>
                    ) : (
                      transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                          <td className="pl-6">
                            <div className="flex items-center gap-3">
                              <div className={cn('p-2 rounded-lg', getTypeStyle(tx.type))}>
                                {getTypeIcon(tx.type)}
                              </div>
                              <span className="font-medium capitalize">
                                {tx.type === 'withdrawal' ? 'exchange' : tx.type}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={cn(
                              'font-semibold',
                              tx.type === 'withdrawal' ? 'text-muted-foreground' : ''
                            )}>
                              {tx.type === 'withdrawal' ? '-' : '+'}
                              {tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT
                            </span>
                          </td>
                          <td>{getStatusBadge(tx.status)}</td>
                          <td className="text-muted-foreground">{formatDate(tx.created_at)}</td>
                          <td className="pr-6">
                            {tx.tx_hash ? (
                              <a
                                href={`https://tronscan.org/#/transaction/${tx.tx_hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground font-mono text-xs px-2 py-1 rounded-md hover:bg-muted transition-colors"
                              >
                                {shortenHash(tx.tx_hash)}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* Salary History Tab */}
          <TabsContent value="salary" className="mt-0">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr className="bg-muted/30">
                      <th className="pl-6">Amount</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Status</th>
                      <th>Block</th>
                      <th>Date</th>
                      <th className="pr-6">Tx Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salaryLoading ? (
                      <>
                        <TableRowSkeleton />
                        <TableRowSkeleton />
                        <TableRowSkeleton />
                      </>
                    ) : salaryTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-16">
                          <Coins className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground font-medium">No salary payments yet</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Your salary transactions will appear here
                          </p>
                        </td>
                      </tr>
                    ) : (
                      salaryTransactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                          <td className="pl-6">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-green-500/10 text-green-600">
                                <Coins className="w-4 h-4" />
                              </div>
                              <span className="font-semibold">
                                +{tx.amount_usdt.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT
                              </span>
                            </div>
                          </td>
                          <td>
                            <code className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
                              {shortenAddress(tx.from_address)}
                            </code>
                          </td>
                          <td>
                            <code className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
                              {shortenAddress(tx.to_address)}
                            </code>
                          </td>
                          <td>{getStatusBadge(tx.status)}</td>
                          <td className="text-muted-foreground font-mono text-sm">
                            {tx.block_number ? `#${tx.block_number.toLocaleString()}` : '—'}
                          </td>
                          <td className="text-muted-foreground text-sm">{formatDate(tx.created_at)}</td>
                          <td className="pr-6">
                            {tx.tx_hash ? (
                              <a
                                href={`https://tronscan.org/#/transaction/${tx.tx_hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground font-mono text-xs px-2 py-1 rounded-md hover:bg-muted transition-colors"
                              >
                                {shortenHash(tx.tx_hash)}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground">Pending...</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
