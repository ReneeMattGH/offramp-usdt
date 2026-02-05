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
import { Loader2, Check, X, Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const AdminKYC = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean, id: string | null }>({ open: false, id: null });
  const [rejectReason, setRejectReason] = useState("");
  const { toast } = useToast();

  const fetchKYC = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/admin/kyc`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setData(await res.json());
      }
    } catch (error) {
      console.error("Failed to fetch KYC", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKYC();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/admin/kyc/${id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        toast({ title: "Approved", description: "User KYC has been approved." });
        fetchKYC();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to approve KYC.", variant: "destructive" });
    }
  };

  const handleReject = async () => {
    if (!rejectDialog.id) return;
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/admin/kyc/${rejectDialog.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: rejectReason })
      });
      if (res.ok) {
        toast({ title: "Rejected", description: "User KYC has been rejected." });
        setRejectDialog({ open: false, id: null });
        setRejectReason("");
        fetchKYC();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to reject KYC.", variant: "destructive" });
    }
  };

  if (loading) return <Loader2 className="animate-spin h-8 w-8 m-auto" />;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">KYC Management</h2>
      <div className="border rounded-lg bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Aadhaar</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted At</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium">{item.users?.account_holder_name || 'Unknown'}</div>
                  <div className="text-xs text-gray-500">{item.users?.email}</div>
                </TableCell>
                <TableCell>{item.aadhaar_number}</TableCell>
                <TableCell>
                  <Badge variant={item.status === 'approved' ? 'default' : item.status === 'rejected' ? 'destructive' : 'secondary'}>
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell>{new Date(item.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="space-x-2">
                  {item.status === 'pending' && (
                    <>
                      <Button size="sm" onClick={() => handleApprove(item.id)}>
                        <Check className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setRejectDialog({ open: true, id: item.id })}>
                        <X className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={rejectDialog.open} onOpenChange={(open) => setRejectDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject KYC</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input 
              placeholder="Reason for rejection" 
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog({ open: false, id: null })}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject}>Confirm Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminKYC;
