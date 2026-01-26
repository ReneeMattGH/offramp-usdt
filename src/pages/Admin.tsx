import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Check, X, RefreshCw, Shield, Banknote, FileText, PauseCircle, PlayCircle, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ExchangeOrder {
  id: string;
  user_id: string;
  usdt_amount: number;
  inr_amount: number;
  rate: number;
  status: string;
  bank_reference?: string;
  failure_reason?: string;
  created_at: string;
  users?: {
    email: string;
    account_holder_name: string;
  };
}

interface PayoutLog {
    id: string;
    created_at: string;
    status: string;
    request_payload: any;
    response_payload: any;
}

interface KYCRequest {
  id: string;
  account_holder_name: string;
  account_number: string;
  kyc_status: "pending" | "verified" | "rejected";
  created_at: string;
}

interface DepositTransaction {
    id: string;
    tx_hash: string;
    amount: number;
    status: string;
    created_at: string;
    processed_at?: string;
    users?: {
        email: string;
        account_holder_name: string;
    };
}

interface USDTWithdrawal {
    id: string;
    user_id: string;
    destination_address: string;
    usdt_amount: number;
    fee: number;
    net_amount: number;
    status: string;
    tx_hash?: string;
    failure_reason?: string;
    created_at: string;
    users?: {
        email: string;
        account_holder_name: string;
    };
}

const Admin = () => {
  const [exchangeOrders, setExchangeOrders] = useState<ExchangeOrder[]>([]);
  const [kycRequests, setKycRequests] = useState<KYCRequest[]>([]);
  const [deposits, setDeposits] = useState<DepositTransaction[]>([]);
  const [usdtWithdrawals, setUsdtWithdrawals] = useState<USDTWithdrawal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrderLogs, setSelectedOrderLogs] = useState<PayoutLog[]>([]);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [depositSearch, setDepositSearch] = useState("");
  const [exchangeSearch, setExchangeSearch] = useState("");
  const [isPayoutPaused, setIsPayoutPaused] = useState(false);
  const [isUSDTWithdrawalPaused, setIsUSDTWithdrawalPaused] = useState(false);
  const [actionDialog, setActionDialog] = useState<{ isOpen: boolean; orderId: string; action: "retry" | "refund" | "cancel" | null }>({ isOpen: false, orderId: "", action: null });
  const [actionReason, setActionReason] = useState("");
  const { toast } = useToast();

  const fetchPayoutStatus = async () => {
      try {
          const response = await fetch("http://localhost:3000/api/admin/payout/control");
          if (response.ok) {
              const data = await response.json();
              setIsPayoutPaused(data.paused);
          }
      } catch (error) {
          console.error("Error fetching payout status:", error);
      }
  };

  const fetchData = async () => {
    setIsLoading(true);
    await fetchPayoutStatus();
    try {
      // Fetch Exchange Orders
      const eResponse = await fetch("http://localhost:3000/api/admin/exchange/orders");
      if (eResponse.ok) {
        const eData = await eResponse.json();
        setExchangeOrders(eData);
      }

      // Fetch KYC Requests
      const kResponse = await fetch("http://localhost:3000/api/admin/kyc-requests");
      if (kResponse.ok) {
        const kData = await kResponse.json();
        setKycRequests(kData);
      }

      // Fetch Deposits
      const dResponse = await fetch("http://localhost:3000/api/admin/deposits");
      if (dResponse.ok) {
          const dData = await dResponse.json();
          setDeposits(dData);
      }

      // Fetch USDT Withdrawals
      const uResponse = await fetch("http://localhost:3000/api/admin/withdrawals/usdt");
      if (uResponse.ok) {
          const uData = await uResponse.json();
          setUsdtWithdrawals(uData);
      }

    } catch (error) {
      console.error("Error fetching admin data:", error);
      toast({
        title: "Error",
        description: "Failed to load admin data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLogs = async (orderId: string) => {
      try {
          const response = await fetch(`http://localhost:3000/api/admin/exchange/logs/${orderId}`);
          if (response.ok) {
              const data = await response.json();
              setSelectedOrderLogs(data);
              setIsLogsOpen(true);
          }
      } catch (error) {
          console.error("Error fetching logs:", error);
          toast({ title: "Error", description: "Failed to fetch logs", variant: "destructive" });
      }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const togglePayoutPause = async () => {
      try {
          const response = await fetch("http://localhost:3000/api/admin/payout/control", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ paused: !isPayoutPaused })
          });
          if (response.ok) {
              const data = await response.json();
              setIsPayoutPaused(data.paused);
              toast({ title: "Success", description: `Payouts ${data.paused ? 'Paused' : 'Resumed'}` });
          }
      } catch (error) {
          toast({ title: "Error", description: "Failed to update payout status", variant: "destructive" });
      }
  };

  const toggleUSDTWithdrawalPause = async () => {
      try {
          const response = await fetch("http://localhost:3000/api/admin/withdrawals/usdt/control", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ paused: !isUSDTWithdrawalPaused })
          });
          if (response.ok) {
              const data = await response.json();
              setIsUSDTWithdrawalPaused(data.paused);
              toast({ title: "Success", description: `USDT Withdrawals ${data.paused ? 'Paused' : 'Resumed'}` });
          }
      } catch (error) {
          toast({ title: "Error", description: "Failed to update USDT withdrawal status", variant: "destructive" });
      }
  };

  const openActionDialog = (id: string, action: "retry" | "refund" | "cancel") => {
      if (action === 'retry') {
          handleExchangeAction(id, action);
      } else {
          setActionDialog({ isOpen: true, orderId: id, action });
          setActionReason("");
      }
  };

  const confirmAction = () => {
      if (actionDialog.orderId && actionDialog.action) {
          handleExchangeAction(actionDialog.orderId, actionDialog.action, actionReason);
          setActionDialog({ isOpen: false, orderId: "", action: null });
      }
  };

  const handleExchangeAction = async (id: string, action: "retry" | "refund" | "cancel", reason?: string) => {
    try {
      const response = await fetch("http://localhost:3000/api/admin/exchange/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: id, action, reason }),
      });

      if (!response.ok) throw new Error("Action failed");

      toast({
        title: "Success",
        description: `Order ${action} processed successfully`,
      });
      
      fetchData();
    } catch (error) {
      console.error("Error processing action:", error);
      toast({
        title: "Error",
        description: "Failed to process request",
        variant: "destructive",
      });
    }
  };

  const handleKycAction = async (userId: string, action: "approve" | "reject") => {
    try {
      const response = await fetch("http://localhost:3000/api/admin/kyc-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, action }),
      });

      if (!response.ok) throw new Error("Action failed");

      toast({
        title: "Success",
        description: `KYC ${action}ed successfully`,
      });
      
      fetchData();
    } catch (error) {
      console.error("Error processing KYC action:", error);
      toast({
        title: "Error",
        description: "Failed to process KYC request",
        variant: "destructive",
      });
    }
  };

  const handleLateDeposit = async (txHash: string) => {
      try {
          const response = await fetch("http://localhost:3000/api/admin/process-late-deposit", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tx_hash: txHash })
          });
          
          if (!response.ok) throw new Error("Action failed");
          
          toast({ title: "Success", description: "Deposit credited successfully" });
          fetchData();
      } catch (error) {
          console.error("Error processing late deposit:", error);
          toast({ title: "Error", description: "Failed to process deposit", variant: "destructive" });
      }
  };

  const handleUSDTAction = async (id: string, action: "retry" | "cancel", reason?: string) => {
      try {
          const url = action === 'retry' 
              ? "http://localhost:3000/api/admin/withdrawals/usdt/retry"
              : "http://localhost:3000/api/admin/withdrawals/usdt/cancel";
          
          const response = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, reason })
          });

          if (!response.ok) {
              const data = await response.json();
              throw new Error(data.error || "Action failed");
          }

          toast({ title: "Success", description: `Withdrawal ${action} successful` });
          fetchData();
      } catch (error: any) {
          console.error("USDT Action Error:", error);
          toast({ title: "Error", description: error.message, variant: "destructive" });
      }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SUCCESS":
      case "completed":
      case "verified":
      case "credited":
      case "credited_manual":
        return <Badge className="bg-green-500">{status}</Badge>;
      case "PROCESSING":
      case "processing":
      case "detected":
        return <Badge className="bg-blue-500">{status}</Badge>;
      case "PENDING":
      case "pending":
        return <Badge className="bg-yellow-500">{status}</Badge>;
      case "FAILED":
      case "failed":
      case "rejected":
        return <Badge className="bg-red-500">{status}</Badge>;
      case "STUCK":
      case "late_deposit":
        return <Badge className="bg-orange-500">{status}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };
  
  const filteredDeposits = deposits.filter(d => 
      d.tx_hash.toLowerCase().includes(depositSearch.toLowerCase()) || 
      (d.users?.email || "").toLowerCase().includes(depositSearch.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Admin Panel</h1>
          <div className="flex gap-2">
            <Button variant={isPayoutPaused ? "default" : "destructive"} size="sm" onClick={togglePayoutPause}>
                {isPayoutPaused ? <PlayCircle className="w-4 h-4 mr-2" /> : <PauseCircle className="w-4 h-4 mr-2" />}
                {isPayoutPaused ? "Resume Payouts" : "Pause Payouts"}
            </Button>
            <Button variant={isUSDTWithdrawalPaused ? "default" : "destructive"} size="sm" onClick={toggleUSDTWithdrawalPause}>
                {isUSDTWithdrawalPaused ? <PlayCircle className="w-4 h-4 mr-2" /> : <PauseCircle className="w-4 h-4 mr-2" />}
                {isUSDTWithdrawalPaused ? "Resume USDT" : "Pause USDT"}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
            </Button>
          </div>
        </div>

        <Tabs defaultValue="exchange" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="exchange" className="flex items-center gap-2">
              <Banknote className="w-4 h-4" /> Exchange Orders
            </TabsTrigger>
            <TabsTrigger value="kyc" className="flex items-center gap-2">
              <Shield className="w-4 h-4" /> KYC Requests
            </TabsTrigger>
            <TabsTrigger value="deposits" className="flex items-center gap-2">
              <Banknote className="w-4 h-4" /> Deposits
            </TabsTrigger>
            <TabsTrigger value="usdt_withdrawals" className="flex items-center gap-2">
              <Banknote className="w-4 h-4" /> USDT Withdrawals
            </TabsTrigger>
          </TabsList>

          <TabsContent value="exchange">
            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>Exchange Orders (USDT → INR)</span>
                  <div className="flex items-center gap-2">
                     <Input 
                        placeholder="Search Orders..." 
                        value={exchangeSearch}
                        onChange={(e) => setExchangeSearch(e.target.value)}
                        className="max-w-xs"
                     />
                     <Button size="sm" variant="outline" onClick={fetchData}>
                        <RefreshCw className="w-4 h-4" />
                     </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Rate</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ref ID / Reason</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exchangeOrders.filter(order => 
                        order.id.toLowerCase().includes(exchangeSearch.toLowerCase()) ||
                        order.users?.account_holder_name.toLowerCase().includes(exchangeSearch.toLowerCase()) ||
                        (order.bank_reference || "").toLowerCase().includes(exchangeSearch.toLowerCase()) ||
                        order.status.toLowerCase().includes(exchangeSearch.toLowerCase())
                      ).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            No exchange orders found
                          </TableCell>
                        </TableRow>
                      ) : (
                        exchangeOrders.filter(order => 
                            order.id.toLowerCase().includes(exchangeSearch.toLowerCase()) ||
                            order.users?.account_holder_name.toLowerCase().includes(exchangeSearch.toLowerCase()) ||
                            (order.bank_reference || "").toLowerCase().includes(exchangeSearch.toLowerCase()) ||
                            order.status.toLowerCase().includes(exchangeSearch.toLowerCase())
                          ).map((order) => (
                          <TableRow key={order.id}>
                            <TableCell>{new Date(order.created_at).toLocaleString()}</TableCell>
                            <TableCell>
                              <div className="font-medium">{order.users?.account_holder_name || "Unknown"}</div>
                              <div className="text-xs text-muted-foreground">{order.users?.email}</div>
                            </TableCell>
                            <TableCell>
                                <div className="font-bold">₹{order.inr_amount}</div>
                                <div className="text-xs text-muted-foreground">{order.usdt_amount} USDT</div>
                            </TableCell>
                            <TableCell>{order.rate}</TableCell>
                            <TableCell>{getStatusBadge(order.status)}</TableCell>
                            <TableCell className="max-w-[200px] truncate" title={order.failure_reason || order.bank_reference || ""}>
                                {order.bank_reference ? (
                                    <span className="font-mono text-xs">{order.bank_reference}</span>
                                ) : (
                                    <span className="text-red-500 text-xs">{order.failure_reason}</span>
                                )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2 items-center">
                                <Button size="icon" variant="ghost" onClick={() => fetchLogs(order.id)} title="View Logs">
                                    <FileText className="w-4 h-4" />
                                </Button>
                                {order.status === "PENDING" && (
                                  <div className="flex justify-end gap-2">
                                    <Button size="sm" variant="destructive" onClick={() => openActionDialog(order.id, "cancel")}>
                                      Cancel
                                    </Button>
                                  </div>
                                )}
                                {order.status === "FAILED" && (
                                  <div className="flex justify-end gap-2">
                                    <Button size="sm" variant="outline" onClick={() => openActionDialog(order.id, "retry")}>
                                      Retry
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => openActionDialog(order.id, "refund")}>
                                      Refund
                                    </Button>
                                  </div>
                                )}
                                {order.status === "STUCK" && (
                                  <div className="flex justify-end gap-2">
                                      <Button size="sm" variant="destructive" onClick={() => openActionDialog(order.id, "refund")}>
                                          Force Refund
                                      </Button>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Dialog open={isLogsOpen} onOpenChange={setIsLogsOpen}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Payout Logs</DialogTitle>
                        <DialogDescription>Bank API interaction history for this order.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {selectedOrderLogs.length === 0 ? (
                            <div className="text-center text-muted-foreground">No logs found.</div>
                        ) : (
                            selectedOrderLogs.map((log) => (
                                <div key={log.id} className="border p-4 rounded-md text-sm">
                                    <div className="flex justify-between mb-2">
                                        <Badge variant="outline">{log.status}</Badge>
                                        <span className="text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <div className="font-semibold mb-1">Request</div>
                                            <pre className="bg-muted p-2 rounded overflow-x-auto text-xs">
                                                {JSON.stringify(log.request_payload, null, 2)}
                                            </pre>
                                        </div>
                                        <div>
                                            <div className="font-semibold mb-1">Response</div>
                                            <pre className="bg-muted p-2 rounded overflow-x-auto text-xs">
                                                {JSON.stringify(log.response_payload, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="kyc">
            <Card>
              <CardHeader>
                <CardTitle>KYC Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Account Number</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {kycRequests.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No KYC requests found
                          </TableCell>
                        </TableRow>
                      ) : (
                        kycRequests.map((req) => (
                          <TableRow key={req.id}>
                            <TableCell>{new Date(req.created_at).toLocaleDateString()}</TableCell>
                            <TableCell className="font-medium">{req.account_holder_name}</TableCell>
                            <TableCell>{req.account_number}</TableCell>
                            <TableCell>{getStatusBadge(req.kyc_status)}</TableCell>
                            <TableCell className="text-right">
                              {req.kyc_status === "pending" && (
                                <div className="flex justify-end gap-2">
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700"
                                    onClick={() => handleKycAction(req.id, "approve")}
                                  >
                                    <Check className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleKycAction(req.id, "reject")}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="deposits">
            <Card>
              <CardHeader>
                <CardTitle>Deposit Transactions</CardTitle>
                <div className="flex gap-2">
                    <Input placeholder="Search TX Hash or Email" value={depositSearch} onChange={(e) => setDepositSearch(e.target.value)} className="max-w-sm" />
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>TX Hash</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDeposits.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>{new Date(tx.created_at).toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{tx.users?.account_holder_name}</span>
                            <span className="text-xs text-muted-foreground">{tx.users?.email}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[150px]" title={tx.tx_hash}>
                            {tx.tx_hash.substring(0, 10)}...
                        </TableCell>
                        <TableCell>{tx.amount} USDT</TableCell>
                        <TableCell>{getStatusBadge(tx.status)}</TableCell>
                        <TableCell>
                            {tx.status === 'late_deposit' && (
                                <Button size="sm" variant="outline" onClick={() => handleLateDeposit(tx.tx_hash)}>
                                    Credit Manually
                                </Button>
                            )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="usdt_withdrawals">
            <Card>
              <CardHeader>
                <CardTitle>USDT Withdrawals</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usdtWithdrawals.map((w) => (
                      <TableRow key={w.id}>
                        <TableCell>{new Date(w.created_at).toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{w.users?.account_holder_name}</span>
                            <span className="text-xs text-muted-foreground">{w.users?.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                            <div className="flex flex-col">
                                <span>{w.usdt_amount} USDT</span>
                                <span className="text-xs text-muted-foreground">Fee: {w.fee}</span>
                            </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[150px]" title={w.destination_address}>
                            {w.destination_address}
                        </TableCell>
                        <TableCell>
                            <div className="flex flex-col gap-1">
                                {getStatusBadge(w.status)}
                                {w.tx_hash && (
                                    <a href={`https://nile.tronscan.org/#/transaction/${w.tx_hash}`} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">
                                        View TX
                                    </a>
                                )}
                                {w.failure_reason && (
                                    <span className="text-xs text-red-500 max-w-[200px] truncate" title={w.failure_reason}>
                                        {w.failure_reason}
                                    </span>
                                )}
                            </div>
                        </TableCell>
                        <TableCell>
                            <div className="flex gap-2">
                                {w.status === 'failed' && (
                                    <Button size="sm" variant="outline" onClick={() => handleUSDTAction(w.id, 'retry')}>
                                        Retry
                                    </Button>
                                )}
                                {w.status === 'pending' && (
                                    <Button size="sm" variant="destructive" onClick={() => handleUSDTAction(w.id, 'cancel', 'Admin Cancelled')}>
                                        Cancel
                                    </Button>
                                )}
                            </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>

      {/* Action Dialog */}
      <Dialog open={actionDialog.isOpen} onOpenChange={(open) => !open && setActionDialog({ ...actionDialog, isOpen: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm {actionDialog.action === 'cancel' ? 'Cancellation' : 'Refund'}</DialogTitle>
            <DialogDescription>
              Please provide a reason for this action.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                id="reason"
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="e.g. Invalid bank details, User request..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog({ ...actionDialog, isOpen: false })}>Cancel</Button>
            <Button onClick={confirmAction}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </AppLayout>
  );
};

export default Admin;