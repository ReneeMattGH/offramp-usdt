import { useState } from 'react';
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
      toast.error('Minimum withdrawal amount is 10 USDT');
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
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (!ifscRegex.test(ifscCode.toUpperCase())) {
      toast.error('Please enter a valid IFSC code');
      return;
    }

    setIsSubmitting(true);

    try {
      // Create withdrawal record
      const { error: withdrawalError } = await supabase
        .from('withdrawals')
        .insert({
          user_id: userId,
          amount: withdrawAmount,
          status: 'pending',
          bank_account_number: accountNumber,
          ifsc_code: ifscCode.toUpperCase(),
          bank_code: bank?.code,
        });

      if (withdrawalError) throw withdrawalError;

      // Create transaction record
      const { error: transactionError } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          type: 'withdrawal',
          amount: withdrawAmount,
          status: 'pending',
        });

      if (transactionError) throw transactionError;

      setIsSuccess(true);
      toast.success('Withdrawal request submitted successfully');

      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 2000);
    } catch (err: any) {
      console.error('Withdrawal error:', err);
      toast.error(err.message || 'Failed to submit withdrawal');
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
            Withdraw to {bank.name}
          </DialogTitle>
          <DialogDescription>
            Enter your bank account details and withdrawal amount
          </DialogDescription>
        </DialogHeader>

        {isSuccess ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-medium mb-2">Withdrawal Submitted!</h3>
            <p className="text-sm text-muted-foreground">
              Your withdrawal is being processed. Funds will arrive in {bank.processing_time}.
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
                  'Withdraw'
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
