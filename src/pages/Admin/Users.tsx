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
import { Loader2, Lock, Unlock } from "lucide-react";

const AdminUsers = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setData(await res.json());
      }
    } catch (error) {
      console.error("Failed to fetch users", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const toggleFreeze = async (id: string, currentStatus: boolean) => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/admin/users/${id}/freeze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ frozen: !currentStatus })
      });
      
      if (res.ok) {
        toast({ title: "Updated", description: `User ${!currentStatus ? 'frozen' : 'unfrozen'}` });
        fetchUsers();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to update user status", variant: "destructive" });
    }
  };

  if (loading) return <Loader2 className="animate-spin h-8 w-8 m-auto" />;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">User Management</h2>
      <div className="border rounded-lg bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Account No</TableHead>
              <TableHead>Balance (USDT)</TableHead>
              <TableHead>KYC</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                    <div className="font-medium">{item.account_holder_name}</div>
                    <div className="text-xs text-gray-500">{item.email}</div>
                </TableCell>
                <TableCell>{item.account_number}</TableCell>
                <TableCell>
                    <div className="font-medium">{item.ledger_accounts?.[0]?.available_balance || 0}</div>
                    <div className="text-xs text-gray-500">Locked: {item.ledger_accounts?.[0]?.locked_balance || 0}</div>
                </TableCell>
                <TableCell>
                    <Badge variant={item.kyc_status === 'verified' ? 'default' : 'outline'}>{item.kyc_status}</Badge>
                </TableCell>
                <TableCell>
                  {item.is_frozen ? <Badge variant="destructive">Frozen</Badge> : <Badge variant="secondary">Active</Badge>}
                </TableCell>
                <TableCell>
                  <Button size="sm" variant={item.is_frozen ? "default" : "destructive"} onClick={() => toggleFreeze(item.id, item.is_frozen)}>
                    {item.is_frozen ? <Unlock className="h-4 w-4 mr-1" /> : <Lock className="h-4 w-4 mr-1" />}
                    {item.is_frozen ? "Unfreeze" : "Freeze"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default AdminUsers;
