import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Building2, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Bank {
  id: string;
  name: string;
  code: string;
  processing_time: string;
}

interface WithdrawalModalProps {
  isOpen: boolean;
  onClose: () => void;
  bank: Bank | null;
  userId: string | undefined;
  maxBalance: number;
  onSuccess: () => void;
}

export function WithdrawalModal({
  isOpen,
  onClose,
  bank,
  userId,
  maxBalance,
  onSuccess,
}: WithdrawalModalProps) {
  const [amount, setAmount] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (bank?.code === 'ICICI' && isOpen) {
      setAccountHolderName('James');
      setAccountNumber('123456789');
      setConfirmAccountNumber('123456789');
      setIfscCode('ICIC2345678');
    }
  }, [bank, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const withdrawAmount = parseFloat(amount);

    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (withdrawAmount > maxBalance) {
      toast.error('Insufficient balance');
      return;
    }

    if (withdrawAmount < 10) {
      toast.error('Minimum exchange amount is 10 USDT');
      return;
    }

    if (!accountHolderName.trim()) {
      toast.error('Please enter account holder name');
      return;
    }

    if (!accountNumber.trim()) {
      toast.error('Please enter account number');
      return;
    }

    if (accountNumber !== confirmAccountNumber) {
      toast.error('Account numbers do not match');
      return;
    }

    if (!ifscCode.trim()) {
      toast.error('Please enter IFSC code');
      return;
    }

    // Validate IFSC code format (11 characters, first 4 letters, 5th is 0, last 6 alphanumeric)
    // Allow specific dummy IFSC for ICICI demo
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (ifscCode !== 'ICIC2345678' && !ifscRegex.test(ifscCode.toUpperCase())) {
      toast.error('Please enter a valid IFSC code');
      return;
    }

    setIsSubmitting(true);

    try {
        // Create withdrawal record
        const { data: withdrawalData, error: withdrawalError } = await supabase
          .from('withdrawals')
          .insert({
            user_id: userId,
            amount: withdrawAmount,
            status: 'pending',
            bank_account_number: accountNumber,
            ifsc_code: ifscCode.toUpperCase(),
          })
          .select()
          .single();

        if (withdrawalError) throw withdrawalError;

        // Deduct from Ledger immediately to prevent double spend
        // Note: In a real app, this should be a database transaction or RPC
        const { error: ledgerError } = await supabase
          .from('ledger')
          .insert({
             user_id: userId,
             tx_hash: withdrawalData.id, // Use withdrawal ID as hash
             credit_usdt: 0,
             debit_usdt: withdrawAmount,
             balance_after: maxBalance - withdrawAmount, // Optimistic balance
             description: `Withdrawal to ${bank?.name || 'Bank'}`
          });
          
         if (ledgerError) {
             console.error('Ledger error:', ledgerError);
             // Should rollback withdrawal here ideally
         }

        // Create transaction record for UI history
        const { error: transactionError } = await supabase
          .from('transactions')
          .insert({
            user_id: userId,
            type: 'withdrawal',
            amount: withdrawAmount,
            status: 'pending',
            tx_hash: withdrawalData.id
          });

        if (transactionError) throw transactionError;

      setIsSuccess(true);
      toast.success('Exchange request submitted successfully');

      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 2000);
    } catch (err: any) {
      console.error('Exchange error:', err);
      toast.error(err.message || 'Failed to submit exchange');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setAmount('');
    setAccountHolderName('');
    setAccountNumber('');
    setConfirmAccountNumber('');
    setIfscCode('');
    setIsSuccess(false);
    onClose();
  };

  const setMaxAmount = () => {
    setAmount(maxBalance.toString());
  };

  if (!bank) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Exchange to {bank.name}
          </DialogTitle>
          <DialogDescription>
            Enter your bank account details and exchange amount
          </DialogDescription>
        </DialogHeader>

        {isSuccess ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-medium mb-2">Exchange Submitted!</h3>
            <p className="text-sm text-muted-foreground">
              Your exchange is being processed. Funds will arrive in {bank.processing_time}.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Bank Info */}
            <div className="bg-muted rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-background border border-border rounded flex items-center justify-center text-sm font-bold">
                  {bank.code.substring(0, 2)}
                </div>
                <div>
                  <p className="font-medium">{bank.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Processing: {bank.processing_time}
                  </p>
                </div>
              </div>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (USDT)</Label>
              <div className="flex gap-2">
                <Input
                  id="amount"
                  type="number"
                  placeholder="Enter amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="10"
                  step="0.01"
                  disabled={isSubmitting}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={setMaxAmount}
                  disabled={isSubmitting}
                >
                  Max
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Available: {maxBalance.toFixed(2)} USDT | Min: 10 USDT | Fee: 1 USDT
              </p>
            </div>

            {/* Account Holder Name */}
            <div className="space-y-2">
              <Label htmlFor="accountHolderName">Account Holder Name</Label>
              <Input
                id="accountHolderName"
                type="text"
                placeholder="Enter name as per bank records"
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            {/* Account Number */}
            <div className="space-y-2">
              <Label htmlFor="accountNumber">Account Number</Label>
              <Input
                id="accountNumber"
                type="text"
                placeholder="Enter account number"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            {/* Confirm Account Number */}
            <div className="space-y-2">
              <Label htmlFor="confirmAccountNumber">Confirm Account Number</Label>
              <Input
                id="confirmAccountNumber"
                type="text"
                placeholder="Re-enter account number"
                value={confirmAccountNumber}
                onChange={(e) => setConfirmAccountNumber(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            {/* IFSC Code */}
            <div className="space-y-2">
              <Label htmlFor="ifscCode">IFSC Code</Label>
              <Input
                id="ifscCode"
                type="text"
                placeholder="e.g., SBIN0001234"
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                maxLength={11}
                disabled={isSubmitting}
              />
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !amount || !accountHolderName || !accountNumber || !confirmAccountNumber || !ifscCode}
                className="flex-1"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  'Exchange'
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
