import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { Shield, Smartphone, Wallet } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";

export default function Auth() {
  const { user, sendOtp, login, signup } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [accountNumber, setAccountNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [holderName, setHolderName] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSendOtp = async () => {
    try {
      setSendingOtp(true);
      const { error } = await sendOtp(accountNumber.trim());
      if (error) {
        toast({ title: "OTP error", description: error, variant: "destructive" });
      } else {
        toast({ title: "OTP sent", description: "Check your phone for the code." });
      }
    } finally {
      setSendingOtp(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const { error } = await login(accountNumber.trim(), otp.trim());
      if (error) {
        toast({ title: "Login failed", description: error, variant: "destructive" });
      } else {
        toast({ title: "Welcome back", description: "You are now logged in." });
        navigate("/dashboard", { replace: true });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const { error } = await signup(
        holderName.trim(),
        accountNumber.trim(),
        ifsc.trim(),
        otp.trim(),
        referralCode.trim() || undefined
      );
      if (error) {
        toast({ title: "Signup failed", description: error, variant: "destructive" });
      } else {
        toast({ title: "Account created", description: "You are now logged in." });
        navigate("/dashboard", { replace: true });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4">
      <div className="max-w-5xl w-full grid gap-10 md:grid-cols-[1.1fr,1fr] items-center">
        <div className="space-y-6 text-slate-100">
          <div className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs font-medium text-slate-300">
            <Shield className="mr-2 h-3 w-3 text-emerald-400" />
            Bank-grade security on TRON USDT
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Offramp your USDT directly to your{" "}
              <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                bank account
              </span>
            </h1>
            <p className="text-slate-400 max-w-xl">
              Login with your bank account number and a secure OTP. No passwords,
              no wallets to manage. Just instant fiat on your existing account.
            </p>
          </div>
          <div className="grid gap-3 text-sm text-slate-300">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-emerald-400" />
              <span>OTP-based login tied to your bank account</span>
            </div>
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-cyan-400" />
              <span>USDT deposits auto-detected and credited to your INR balance</span>
            </div>
          </div>
          {user && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100">
              Currently signed in as{" "}
              <span className="font-medium">
                {user.account_holder_name || "Guest"}
              </span>{" "}
              (Account {user.account_number}). You can link your real bank account
              anytime using signup.
            </div>
          )}
        </div>

        <Card className="bg-slate-950/80 border-slate-800 shadow-2xl shadow-emerald-500/10">
          <CardHeader>
            <CardTitle className="text-lg">Access your Offramp account</CardTitle>
            <CardDescription>
              Enter your bank details once and verify with a one-time password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs
              value={mode}
              onValueChange={(v) => setMode(v as "login" | "signup")}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-4">
                <form className="space-y-4" onSubmit={handleLogin}>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">
                      Bank account number
                    </label>
                    <Input
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      placeholder="0000 0000 0000"
                      className="bg-slate-900 border-slate-700"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-slate-200">
                        One-time password
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-slate-700 text-xs"
                        onClick={handleSendOtp}
                        disabled={sendingOtp || !accountNumber}
                      >
                        {sendingOtp ? "Sending..." : "Send OTP"}
                      </Button>
                    </div>
                    <Input
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      maxLength={6}
                      placeholder="6-digit code"
                      className="bg-slate-900 border-slate-700 tracking-[0.3em] text-center"
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={submitting}
                  >
                    {submitting ? "Verifying..." : "Login securely"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-4">
                <form className="space-y-4" onSubmit={handleSignup}>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">
                      Account holder name
                    </label>
                    <Input
                      value={holderName}
                      onChange={(e) => setHolderName(e.target.value)}
                      placeholder="As per bank records"
                      className="bg-slate-900 border-slate-700"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">
                      Bank account number
                    </label>
                    <Input
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      placeholder="0000 0000 0000"
                      className="bg-slate-900 border-slate-700"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">
                      IFSC code
                    </label>
                    <Input
                      value={ifsc}
                      onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                      placeholder="SBIN0000000"
                      className="bg-slate-900 border-slate-700 uppercase"
                      maxLength={11}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-slate-200">
                        One-time password
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-slate-700 text-xs"
                        onClick={handleSendOtp}
                        disabled={sendingOtp || !accountNumber}
                      >
                        {sendingOtp ? "Sending..." : "Send OTP"}
                      </Button>
                    </div>
                    <Input
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      maxLength={6}
                      placeholder="6-digit code"
                      className="bg-slate-900 border-slate-700 tracking-[0.3em] text-center"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-400">
                      Referral code (optional)
                    </label>
                    <Input
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                      placeholder="FRIEND1"
                      className="bg-slate-900 border-slate-700 uppercase"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={submitting}
                  >
                    {submitting ? "Creating account..." : "Create account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
