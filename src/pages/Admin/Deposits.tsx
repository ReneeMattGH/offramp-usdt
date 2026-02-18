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
import { Loader2, ExternalLink } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
  } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const AdminDeposits = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creditDialog, setCreditDialog] = useState<{ open: boolean, txHash: string }>({ open: false, txHash: "" });
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const { toast } = useToast();

  const fetchDeposits = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/admin/deposits`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setData(await res.json());
      }
    } catch (error) {
      console.error("Failed to fetch deposits", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeposits();
  }, []);

  const handleManualCredit = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/admin/deposits/credit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, amount: parseFloat(amount), txHash: creditDialog.txHash })
      });
      
      const result = await res.json();
      if (res.ok) {
        toast({ title: "Credited", description: "Deposit credited manually." });
        setCreditDialog({ open: false, txHash: "" });
        fetchDeposits();
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleApprove = async (txHash: string) => {
    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/admin/deposits/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ txHash })
        });
        
        const result = await res.json();
        if (res.ok) {
            toast({ title: "Approved", description: "Deposit credited successfully." });
            fetchDeposits();
        } else {
            throw new Error(result.error);
        }
    } catch (error: any) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  if (loading) return <Loader2 className="animate-spin h-8 w-8 m-auto" />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Deposit Monitoring</h2>
        <Button onClick={() => setCreditDialog({ open: true, txHash: "" })}>Manual Credit</Button>
      </div>
      
      <div className="border rounded-lg bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tx Hash</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Amount (USDT)</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs">
                    {item.tx_hash?.substring(0, 10)}...
                    <a href={`https://tronscan.org/#/transaction/${item.tx_hash}`} target="_blank" className="ml-2 inline-block">
                        <ExternalLink className="h-3 w-3" />
                    </a>
                </TableCell>
                <TableCell>{item.users?.email || item.user_id}</TableCell>
                <TableCell className="text-green-600 font-bold">+{item.amount}</TableCell>
                <TableCell>{new Date(item.created_at).toLocaleString()}</TableCell>
                <TableCell>
                    <Badge variant={item.status === 'credited' ? 'default' : 'secondary'}>
                        {item.status}
                    </Badge>
                </TableCell>
                <TableCell>
                    {(item.status === 'detected' || item.status === 'pending_approval') && (
                        <Button size="sm" onClick={() => handleApprove(item.tx_hash)}>Approve</Button>
                    )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={creditDialog.open} onOpenChange={(open) => setCreditDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manual Deposit Credit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
                <label className="text-sm">User ID</label>
                <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="UUID" />
            </div>
            <div className="space-y-2">
                <label className="text-sm">Amount (USDT)</label>
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" type="number" />
            </div>
            <div className="space-y-2">
                <label className="text-sm">Tx Hash (Reference)</label>
                <Input value={creditDialog.txHash} onChange={(e) => setCreditDialog(prev => ({ ...prev, txHash: e.target.value }))} placeholder="Tx Hash" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditDialog({ open: false, txHash: "" })}>Cancel</Button>
            <Button onClick={handleManualCredit}>Credit User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDeposits;
