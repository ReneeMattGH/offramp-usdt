import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { useBanks } from '@/hooks/useBanks';
import { AppLayout } from '@/components/layout/AppLayout';
import { AlertCircle, Building2, ChevronRight } from 'lucide-react';
import { WithdrawalModal } from '@/components/WithdrawalModal';

interface Bank {
  id: string;
  name: string;
  code: string;
  processing_time: string;
}

export default function Withdraw() {
  const { user } = useAuth();
  const { balance, isLoading: balanceLoading, refetch } = useWalletBalance(user?.tron_wallet_address || null);
  const { banks, isLoading: banksLoading } = useBanks();
  
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleBankClick = (bank: Bank) => {
    setSelectedBank(bank);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedBank(null);
  };

  const handleWithdrawalSuccess = () => {
    refetch();
  };

  return (
    <AppLayout>
      <div className="animate-fade-in max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="page-header">Withdraw to Bank</h1>
          <p className="page-description mt-1">
            Select a bank to withdraw your USDT to INR
          </p>
        </div>

        {/* Balance Display */}
        <div className="stat-card mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Available Balance</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold">
                  {balanceLoading ? '...' : balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-lg text-muted-foreground">USDT</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bank Selection */}
        <div className="stat-card mb-6">
          <h2 className="font-medium mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Select Bank
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Choose your bank to proceed with withdrawal
          </p>

          {banksLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {banks.map((bank) => (
                <button
                  key={bank.code}
                  onClick={() => handleBankClick(bank)}
                  className="w-full p-4 bg-muted hover:bg-muted/80 rounded-lg flex items-center justify-between transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-background border border-border rounded-lg flex items-center justify-center text-sm font-bold">
                      {bank.code.substring(0, 2)}
                    </div>
                    <div className="text-left">
                      <p className="font-medium">{bank.name}</p>
                      <p className="text-sm text-muted-foreground">{bank.processing_time}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info Notice */}
        <div className="p-4 bg-muted rounded-lg flex gap-3">
          <AlertCircle className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Withdrawal Process</p>
            <ul className="space-y-1">
              <li>• Withdrawals are processed within 24 hours</li>
              <li>• Bank transfer time depends on the selected bank</li>
              <li>• A 1 USDT network fee applies</li>
              <li>• Minimum withdrawal: 10 USDT</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Withdrawal Modal */}
      <WithdrawalModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        bank={selectedBank}
        userId={user?.id}
        maxBalance={balance}
        onSuccess={handleWithdrawalSuccess}
      />
    </AppLayout>
  );
}
