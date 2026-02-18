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
import { useAuth } from '@/lib/auth';

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
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { user, sendOtp, sessionToken } = useAuth();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (bank?.code === 'ICICI') {
      setAccountHolderName('demoguy');
      setAccountNumber('24682468');
      setConfirmAccountNumber('24682468');
      setIfscCode('1234578');
      setPhoneNumber('9876543210');
      setIsOtpSent(false);
      setOtp('');
      return;
    }

    if (user) {
      setAccountHolderName(user.account_holder_name || '');
      setAccountNumber(user.account_number || '');
      setConfirmAccountNumber(user.account_number || '');
      setIfscCode(user.ifsc_code || '');
    }
  }, [isOpen, bank, user]);

  const handleSendOtp = async () => {
    if (!accountNumber.trim()) {
      toast.error('Please enter account number');
      return;
    }

    if (!phoneNumber.trim()) {
      toast.error('Please enter phone number');
      return;
    }

    if (bank?.code === 'ICICI') {
      setIsSendingOtp(true);
      setIsOtpSent(true);
      toast.success('Demo OTP sent: 123456');
      setIsSendingOtp(false);
      return;
    }

    setIsSendingOtp(true);

    try {
      const { error } = await sendOtp(accountNumber);
      if (error) {
        toast.error(error);
        return;
      }
      setIsOtpSent(true);
      toast.success('OTP sent successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send OTP');
    } finally {
      setIsSendingOtp(false);
    }
  };

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

    const isIciciDemo = bank?.code === 'ICICI';

    if (isIciciDemo) {
      if (
        accountHolderName !== 'demoguy' ||
        accountNumber !== '24682468' ||
        confirmAccountNumber !== '24682468' ||
        ifscCode !== '1234578' ||
        phoneNumber !== '9876543210'
      ) {
        toast.error('Please use the ICICI demo details exactly');
        return;
      }
    } else {
      const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
      if (!ifscRegex.test(ifscCode.toUpperCase())) {
        toast.error('Please enter a valid IFSC code');
        return;
      }
    }

    if (!phoneNumber.trim()) {
      toast.error('Please enter phone number');
      return;
    }

    if (!isOtpSent) {
      toast.error('Please request OTP before submitting');
      return;
    }

    if (!otp.trim()) {
      toast.error('Please enter OTP');
      return;
    }

    if (isIciciDemo) {
      if (otp !== '123456') {
        toast.error('Invalid demo OTP');
        return;
      }
    } else {
      // Real OTP check for non-demo users
      setIsSubmitting(true);
      try {
        const { data: otpData, error: otpError } = await supabase
          .from('otps')
          .select('*')
          .eq('account_number', accountNumber)
          .eq('otp_code', otp)
          .eq('used', false)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (otpError || !otpData) {
          toast.error('Invalid or expired OTP');
          setIsSubmitting(false);
          return;
        }

        await supabase
          .from('otps')
          .update({ used: true })
          .eq('id', otpData.id);
      } catch (err: any) {
         toast.error(err.message || 'OTP Verification Failed');
         setIsSubmitting(false);
         return;
      }
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          amount: withdrawAmount,
          bank_account_number: accountNumber,
          ifsc_code: ifscCode.toUpperCase(),
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        localStorage.removeItem('token');
        window.location.href = '/login';
        return;
      }

      if (!response.ok) {
        if (data.error === 'KYC_REQUIRED') {
            toast.error(data.message || 'KYC Verification Required');
            setTimeout(() => window.location.href = '/settings', 2000);
            throw new Error(data.message || 'KYC Verification Required');
        }
        throw new Error(data.error || 'Withdrawal failed');
      }

      // Deduct from Ledger immediately to prevent double spend
      // Note: In a real app, this should be a database transaction or RPC
      /*
      const { error: ledgerError } = await supabase
        .from('ledger')
        .insert({
           user_id: userId,
           tx_hash: data.withdrawal.id, // Use withdrawal ID as hash
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
          tx_hash: data.withdrawal.id
        });

      if (transactionError) throw transactionError;
      */

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
    setPhoneNumber('');
    setOtp('');
    setIsOtpSent(false);
    setIsSendingOtp(false);
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

            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                type="tel"
                placeholder="Enter Indian mobile number"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="otp">OTP</Label>
              <div className="flex gap-2">
                <Input
                  id="otp"
                  type="text"
                  placeholder="Enter OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  maxLength={6}
                  disabled={isSubmitting}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSendOtp}
                  disabled={isSubmitting || isSendingOtp}
                >
                  {isSendingOtp ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Sending
                    </>
                  ) : (
                    'Send OTP'
                  )}
                </Button>
              </div>
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
                disabled={
                  isSubmitting ||
                  !amount ||
                  !accountHolderName ||
                  !accountNumber ||
                  !confirmAccountNumber ||
                  !ifscCode ||
                  !phoneNumber ||
                  !otp
                }
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
