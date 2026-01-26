import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

interface KYCVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId?: string; // Optional for backward compatibility, but we use useAuth
}
        
export function KYCVerificationModal({
  isOpen,
  onClose,
  onSuccess,
}: KYCVerificationModalProps) {
  const { user, sessionToken } = useAuth();
  // Simplified Flow: aadhaar -> success
  const [step, setStep] = useState<'aadhaar' | 'success'>('aadhaar');
  const [aadhaarNumber, setAadhaarNumber] = useState('123456789012');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleKYCSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (aadhaarNumber.length !== 12) {
      toast.error('Please enter a valid 12-digit Aadhaar number');
      return;
    }

    setIsSubmitting(true);

    try {
      // Call backend to process KYC
      const response = await fetch('http://localhost:3000/api/verify-kyc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          aadhaar_number: aadhaarNumber,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'KYC submission failed');
      }

      setStep('success');
      toast.success('KYC Verified Successfully');
      
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 2000);

    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setStep('aadhaar');
    setAadhaarNumber('123456123456');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Identity Verification</DialogTitle>
          <DialogDescription>
            Verify your identity to enable withdrawals. This is a one-time process.
          </DialogDescription>
        </DialogHeader>

        {step === 'aadhaar' ? (
          <form onSubmit={handleKYCSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="aadhaar">Aadhaar Number</Label>
              <Input
                id="aadhaar"
                placeholder="Enter 12-digit Aadhaar number"
                value={aadhaarNumber}
                onChange={(e) => setAadhaarNumber(e.target.value)}
                maxLength={12}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                For demo: Use 123456789012 or 999988887777
              </p>
            </div>
            
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Verify Identity
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="py-6 text-center">
            <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-medium mb-2">Verification Successful!</h3>
            <p className="text-sm text-muted-foreground">
              Your identity has been verified. You can now process withdrawals.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
