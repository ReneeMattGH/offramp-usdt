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
  const [viewDialog, setViewDialog] = useState<{ open: boolean, data: any | null }>({ open: false, data: null });
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
      <div className="border rounded-lg bg-white overflow-x-auto">
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
                  <div className="font-medium">{item.account_holder_name || 'Unknown'}</div>
                  <div className="text-xs text-gray-500">{item.email}</div>
                </TableCell>
                <TableCell>{item.aadhaar_number}</TableCell>
                <TableCell>
                  <Badge variant={item.kyc_status === 'approved' ? 'default' : item.kyc_status === 'rejected' ? 'destructive' : 'secondary'}>
                    {item.kyc_status}
                  </Badge>
                </TableCell>
                <TableCell>{new Date(item.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="space-x-2">
                  <Button size="sm" variant="outline" className="text-blue-600" onClick={() => setViewDialog({ open: true, data: item })}>
                    <Eye className="h-4 w-4 mr-1" /> View
                  </Button>
                  {item.kyc_status === 'pending' && (
                    <>
                      <Button size="sm" variant="outline" className="text-green-600" onClick={() => handleApprove(item.id)}>
                        <Check className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600" onClick={() => setRejectDialog({ open: true, id: item.id })}>
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

      <Dialog open={viewDialog.open} onOpenChange={(open) => setViewDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>KYC Details</DialogTitle>
          </DialogHeader>
          {viewDialog.data && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold mb-2">User Information</h3>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-muted-foreground">Name:</span> {viewDialog.data.account_holder_name}</p>
                    <p><span className="text-muted-foreground">Email:</span> {viewDialog.data.email}</p>
                    <p><span className="text-muted-foreground">Account:</span> {viewDialog.data.account_number}</p>
                    <p><span className="text-muted-foreground">Status:</span> <Badge>{viewDialog.data.kyc_status}</Badge></p>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Aadhaar Details</h3>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-muted-foreground">Number:</span> {viewDialog.data.aadhaar_number}</p>
                    <p><span className="text-muted-foreground">Submitted:</span> {new Date(viewDialog.data.created_at).toLocaleString()}</p>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Aadhaar Card Photo</h3>
                <div className="border rounded-lg p-2 bg-slate-50 flex justify-center">
                  {viewDialog.data.aadhaar_photo_url ? (
                    <img 
                      src={viewDialog.data.aadhaar_photo_url} 
                      alt="Aadhaar Card" 
                      className="max-h-[400px] object-contain"
                    />
                  ) : (
                    <div className="py-10 text-muted-foreground flex flex-col items-center">
                       <Eye className="h-10 w-10 mb-2 opacity-20" />
                       <p>No document image available</p>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                  {viewDialog.data.kyc_status === 'pending' && (
                    <div className="flex gap-2 w-full justify-end">
                      <Button variant="destructive" onClick={() => {
                        setRejectDialog({ open: true, id: viewDialog.data.id });
                        setViewDialog({ open: false, data: null });
                      }}>
                        Reject
                      </Button>
                      <Button className="bg-green-600 hover:bg-green-700" onClick={() => {
                        handleApprove(viewDialog.data.id);
                        setViewDialog({ open: false, data: null });
                      }}>
                        Approve
                      </Button>
                    </div>
                  )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
