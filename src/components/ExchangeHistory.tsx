import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, RefreshCcw, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ExchangeOrder {
  id: string;
  usdt_amount: number;
  inr_amount: number;
  rate: number;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'STUCK';
  bank_reference: string | null;
  failure_reason: string | null;
  created_at: string;
}

export function ExchangeHistory() {
  const { sessionToken, user } = useAuth();
  const [orders, setOrders] = useState<ExchangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchOrders = async () => {
    try {
      const response = await fetch('/api/exchange/orders', {
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
      });
      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        localStorage.removeItem('token');
        window.location.href = '/login';
        return;
      }
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionToken && user?.id) {
      fetchOrders();

      // Subscribe to Realtime Updates
      const channel = supabase
        .channel('exchange-updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'exchange_orders',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            console.log('Realtime Update:', payload);
            if (payload.eventType === 'INSERT') {
              setOrders((prev) => [payload.new as ExchangeOrder, ...prev]);
              toast({ title: "New Order", description: "Exchange order created successfully." });
            } else if (payload.eventType === 'UPDATE') {
              setOrders((prev) => prev.map(o => o.id === payload.new.id ? payload.new as ExchangeOrder : o));
              
              const newStatus = (payload.new as ExchangeOrder).status;
              if (newStatus === 'SUCCESS') {
                toast({ title: "Exchange Success", description: "Funds have been sent to your bank." });
              } else if (newStatus === 'FAILED') {
                toast({ title: "Exchange Failed", description: "Funds have been refunded.", variant: "destructive" });
              }
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [sessionToken, user?.id]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS': return 'text-green-600 bg-green-50 border-green-200';
      case 'FAILED': return 'text-red-600 bg-red-50 border-red-200';
      case 'PROCESSING': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS': return <CheckCircle2 className="w-4 h-4" />;
      case 'FAILED': return <XCircle className="w-4 h-4" />;
      case 'PROCESSING': return <RefreshCcw className="w-4 h-4 animate-spin" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  if (loading && orders.length === 0) {
    return <div className="p-4 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
  }

  if (orders.length === 0) {
    return (
      <div className="text-center p-8 border rounded-lg bg-muted/20">
        <p className="text-muted-foreground">No exchange history found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Exchange History</h3>
      <div className="space-y-3">
        {orders.map((order) => (
          <div key={order.id} className="p-4 rounded-lg border bg-card shadow-sm transition-all hover:shadow-md">
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 border ${getStatusColor(order.status)}`}>
                  {getStatusIcon(order.status)}
                  {order.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(order.created_at).toLocaleString()}
                </span>
              </div>
              <div className="text-right">
                <p className="font-semibold text-foreground">₹{order.inr_amount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{order.usdt_amount} USDT @ {order.rate}</p>
              </div>
            </div>
            
            {order.bank_reference && (
              <div className="mt-2 text-xs bg-muted p-2 rounded flex justify-between">
                <span className="text-muted-foreground">Ref ID:</span>
                <span className="font-mono">{order.bank_reference}</span>
              </div>
            )}
            
            {order.failure_reason && (
              <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100 flex gap-2 items-start">
                <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>{order.failure_reason}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
