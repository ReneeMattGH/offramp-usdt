import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, RefreshCw, XCircle, CheckCircle } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const AdminExchange = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionDialog, setActionDialog] = useState<{ open: boolean, id: string | null, action: 'approved' | 'success' | 'failed' | null }>({ open: false, id: null, action: null });
  const [note, setNote] = useState("");
  const { toast } = useToast();

  const fetchOrders = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/admin/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setData(await res.json());
      }
    } catch (error) {
      console.error("Failed to fetch orders", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleUpdateStatus = async () => {
    if (!actionDialog.id || !actionDialog.action) return;
    
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/admin/orders/${actionDialog.id}/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: actionDialog.action, note })
      });
      
      if (res.ok) {
        toast({ title: "Updated", description: `Order marked as ${actionDialog.action}` });
        setActionDialog({ open: false, id: null, action: null });
        setNote("");
        fetchOrders();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to update order", variant: "destructive" });
    }
  };

  if (loading) return <Loader2 className="animate-spin h-8 w-8 m-auto" />;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Exchange & Payouts</h2>
      <div className="border rounded-lg bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs">{item.id.substring(0, 8)}...</TableCell>
                <TableCell>{item.users?.email}</TableCell>
                <TableCell>
                    <div>{item.usdt_amount} USDT</div>
                    <div className="text-xs text-gray-500">₹{item.inr_amount}</div>
                </TableCell>
                <TableCell>₹{item.rate}</TableCell>
                <TableCell>
                  <Badge variant={item.status === 'completed' ? 'default' : item.status === 'failed' ? 'destructive' : 'secondary'}>
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell className="space-x-2">
                  {item.status === 'PENDING' && (
                    <Button size="sm" onClick={() => setActionDialog({ open: true, id: item.id, action: 'approved' })}>
                        Approve
                    </Button>
                  )}
                  {item.status === 'processing' && (
                    <>
                      <Button size="sm" variant="outline" className="text-green-600" onClick={() => setActionDialog({ open: true, id: item.id, action: 'success' })}>
                        <CheckCircle className="h-4 w-4 mr-1" /> Mark Done
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600" onClick={() => setActionDialog({ open: true, id: item.id, action: 'failed' })}>
                        <XCircle className="h-4 w-4 mr-1" /> Mark Failed
                      </Button>
                    </>
                  )}
                  {item.status === 'APPROVED' && (
                     <div className="text-xs text-gray-500 italic">Waiting for Payout Worker...</div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={actionDialog.open} onOpenChange={(open) => setActionDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Action: {actionDialog.action?.toUpperCase()}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input 
              placeholder="Add a note (optional)" 
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog({ open: false, id: null, action: null })}>Cancel</Button>
            <Button onClick={handleUpdateStatus}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminExchange;
