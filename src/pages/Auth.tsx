import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wallet, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type AuthMode = 'login' | 'signup';

export default function Auth() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [isLoading, setIsLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  
  // Form fields
  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [otp, setOtp] = useState('');

  const { login, signup, sendOtp } = useAuth();
  const navigate = useNavigate();

  const handleSendOtp = async () => {
    if (!accountNumber) {
      toast.error('Please enter your account number');
      return;
    }

    if (mode === 'signup' && (!accountHolderName || !ifscCode)) {
      toast.error('Please fill all bank details');
      return;
    }

    setIsLoading(true);
    const { error } = await sendOtp(accountNumber);
    setIsLoading(false);

    if (error) {
      toast.error(error);
      return;
    }

    setOtpSent(true);
    setStep('otp');
    toast.success('OTP sent! Check console for test OTP.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!otp) {
      toast.error('Please enter the OTP');
      return;
    }

    setIsLoading(true);

    if (mode === 'login') {
      const { error } = await login(accountNumber, otp);
      if (error) {
        toast.error(error);
        setIsLoading(false);
        return;
      }
    } else {
      const { error } = await signup(accountHolderName, accountNumber, ifscCode, otp);
      if (error) {
        toast.error(error);
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(false);
    navigate('/dashboard');
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    setStep('details');
    setOtpSent(false);
    setOtp('');
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center p-12">
        <div className="max-w-md">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-primary-foreground rounded-lg flex items-center justify-center">
              <Wallet className="w-6 h-6 text-primary" />
            </div>
            <span className="text-2xl font-semibold text-primary-foreground tracking-tight">
              CryptoPayroll
            </span>
          </div>
          <h1 className="text-4xl font-semibold text-primary-foreground leading-tight mb-4">
            Receive your salary in crypto.
            <br />
            Withdraw to your bank.
          </h1>
          <p className="text-primary-foreground/70 text-lg">
            Secure USDT (TRC20) payroll platform with instant bank withdrawals.
          </p>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Wallet className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold tracking-tight">CryptoPayroll</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold tracking-tight">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="text-muted-foreground mt-2">
              {mode === 'login' 
                ? 'Enter your bank details to login' 
                : 'Link your bank account to get started'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {step === 'details' && (
              <>
                {mode === 'signup' && (
                  <div className="space-y-2">
                    <Label htmlFor="accountHolderName">Account Holder Name</Label>
                    <Input
                      id="accountHolderName"
                      placeholder="Enter your full name"
                      value={accountHolderName}
                      onChange={(e) => setAccountHolderName(e.target.value)}
                      className="h-11"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="accountNumber">Account Number</Label>
                  <Input
                    id="accountNumber"
                    placeholder="Enter your account number"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="h-11"
                  />
                </div>

                {mode === 'signup' && (
                  <div className="space-y-2">
                    <Label htmlFor="ifscCode">IFSC Code</Label>
                    <Input
                      id="ifscCode"
                      placeholder="Enter IFSC code"
                      value={ifscCode}
                      onChange={(e) => setIfscCode(e.target.value)}
                      className="h-11"
                    />
                  </div>
                )}

                <Button 
                  type="button" 
                  className="w-full h-11"
                  onClick={handleSendOtp}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Send OTP
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </>
            )}

            {step === 'otp' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="otp">Enter OTP</Label>
                  <Input
                    id="otp"
                    placeholder="6-digit OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    maxLength={6}
                    className="h-11 text-center text-lg tracking-widest"
                  />
                  <p className="text-xs text-muted-foreground">
                    OTP sent to your registered mobile number
                  </p>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-11"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      {mode === 'login' ? 'Login' : 'Create Account'}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>

                <button
                  type="button"
                  className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => {
                    setStep('details');
                    setOtp('');
                  }}
                >
                  ← Back to bank details
                </button>
              </>
            )}
          </form>

          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
              <button
                type="button"
                onClick={switchMode}
                className="ml-1 text-foreground font-medium hover:underline"
              >
                {mode === 'login' ? 'Sign up' : 'Login'}
              </button>
            </p>
          </div>

          {/* Demo credentials hint */}
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground text-center">
              <strong>Demo Account:</strong> Account: 24682468 | IFSC: 1234578
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
