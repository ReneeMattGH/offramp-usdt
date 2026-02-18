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
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [aadhaarImage, setAadhaarImage] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleKYCSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (aadhaarNumber.length !== 12) {
      toast.error('Please enter a valid 12-digit Aadhaar number');
      return;
    }
    if (!aadhaarImage) {
      toast.error('Please upload your Aadhaar card photo');
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('aadhaar_number', aadhaarNumber);
      formData.append('aadhaar_image', aadhaarImage);

      // Call backend to process KYC
      const response = await fetch('/api/verify-kyc', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        },
        body: formData,
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
        throw new Error(data.error || 'KYC submission failed');
      }

      setStep('success');
      toast.success('KYC Submitted for Review');
      
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
    setAadhaarNumber('');
    setAadhaarImage(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Identity Verification</DialogTitle>
          <DialogDescription>
            Verify your identity to enable withdrawals. Please upload your Aadhaar card.
          </DialogDescription>
        </DialogHeader>

        {step === 'aadhaar' ? (
          <form onSubmit={handleKYCSubmit} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="aadhaar">Aadhaar Number</Label>
                <Input
                  id="aadhaar"
                  placeholder="Enter 12-digit Aadhaar Number"
                  value={aadhaarNumber}
                  onChange={(e) => setAadhaarNumber(e.target.value.replace(/\D/g, '').slice(0, 12))}
                  required
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="picture">Aadhaar Card Photo</Label>
                <Input 
                  id="picture" 
                  type="file" 
                  accept="image/*" 
                  onChange={(e) => setAadhaarImage(e.target.files?.[0] || null)} 
                  required 
                />
            </div>
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit for Verification
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="py-6 text-center">
            <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-medium mb-2">Submitted Successfully!</h3>
            <p className="text-sm text-muted-foreground">
              Your documents have been submitted for review. Please wait for admin approval.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
