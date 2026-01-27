import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Copy, Shield, Building2, Wallet, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useState } from 'react';
import { KYCVerificationModal } from '@/components/KYCVerificationModal';

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const [isKYCModalOpen, setIsKYCModalOpen] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const handleKYCSuccess = async () => {
    await refreshUser();
    // No explicit reload needed, but we can do it if we want to be absolutely sure
    // window.location.reload(); 
  };

  const maskAccountNumber = (num: string) => {
    if (!num) return '';
    return '••••' + num.slice(-4);
  };

  return (
    <AppLayout>
      <div className="animate-fade-in max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="page-header">Settings</h1>
          <p className="page-description mt-1">
            Manage your account settings and security
          </p>
        </div>

        {/* Bank Details Section */}
        <div className="stat-card mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-medium">Bank Account Details</h2>
              <p className="text-sm text-muted-foreground">
                {user?.kyc_status === 'approved' ? 'Verified details are read-only' : 'Verify identity to update'}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-border">
              <div>
                <p className="text-sm text-muted-foreground">Account Holder Name</p>
                <p className="font-medium mt-0.5">{user?.account_holder_name}</p>
              </div>
            </div>
            
            <div className="flex items-center justify-between py-3 border-b border-border">
              <div>
                <p className="text-sm text-muted-foreground">Account Number</p>
                <p className="font-medium mt-0.5">{maskAccountNumber(user?.account_number || '')}</p>
              </div>
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-muted-foreground">IFSC Code</p>
                <p className="font-medium mt-0.5">{user?.ifsc_code}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Wallet Section */}
        <div className="stat-card mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-medium">TRON Wallet</h2>
              <p className="text-sm text-muted-foreground">Your USDT receiving address</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Wallet Address</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono bg-muted px-3 py-2.5 rounded-md break-all">
                  {user?.tron_wallet_address}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(user?.tron_wallet_address || '')}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* KYC Section */}
        <div className="stat-card mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-medium">Identity Verification (KYC)</h2>
              <p className="text-sm text-muted-foreground">Status of your identity verification</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-muted-foreground">Current Status</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    user?.kyc_status === 'approved' ? 'bg-green-100 text-green-800' :
                    user?.kyc_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    user?.kyc_status === 'rejected' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {(user?.kyc_status || 'NOT SUBMITTED').toUpperCase().replace('_', ' ')}
                  </span>
                </div>
              </div>
              {(!user?.kyc_status || user?.kyc_status === 'rejected' || user?.kyc_status === 'not_submitted') && (
                <Button 
                  onClick={() => setIsKYCModalOpen(true)}
                >
                  Verify Identity
                </Button>
              )}
            </div>
             {user?.kyc_status === 'pending' && (
                <p className="text-sm text-yellow-600 bg-yellow-50 p-3 rounded-md">
                  Your verification is currently under review. This usually takes 1-2 business days.
                </p>
              )}
          </div>
        </div>

        {/* Security Section */}
        <div className="stat-card mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-medium">Security</h2>
              <p className="text-sm text-muted-foreground">Account protection information</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-border">
              <div>
                <p className="text-sm text-muted-foreground">Authentication Method</p>
                <p className="font-medium mt-0.5">Bank-based OTP</p>
              </div>
              <span className="text-xs bg-muted px-2 py-1 rounded">Enabled</span>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-border">
              <div>
                <p className="text-sm text-muted-foreground">Private Key Storage</p>
                <p className="font-medium mt-0.5">Encrypted</p>
              </div>
              <span className="text-xs bg-muted px-2 py-1 rounded">Secured</span>
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-muted-foreground">Session Status</p>
                <p className="font-medium mt-0.5">Active</p>
              </div>
              <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">Online</span>
            </div>
          </div>
        </div>

        {/* Compliance Notice */}
        <div className="p-4 bg-muted rounded-lg flex gap-3">
          <AlertTriangle className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium mb-1">Compliance Notice</h3>
            <p className="text-sm text-muted-foreground">
              Bank details are locked after successful verification for security reasons. 
              If you need to update your verified bank information, please contact support.
            </p>
          </div>
        </div>
      </div>

      <KYCVerificationModal 
        isOpen={isKYCModalOpen}
        onClose={() => setIsKYCModalOpen(false)}
        onSuccess={handleKYCSuccess}
        userId={user?.id}
      />
    </AppLayout>
  );
}
