import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, Wallet, ArrowRight } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <Wallet className="h-10 w-10 text-primary" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl">
            CryptoPayroll
          </h1>
          <p className="text-muted-foreground">
            Secure, fast, and transparent salary management on the blockchain.
          </p>
        </div>

        <div className="grid gap-4">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>Bank-grade Security</span>
          </div>
          
          <Button 
            size="lg" 
            className="w-full" 
            onClick={() => navigate("/login")}
          >
            Get Started <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <div className="mt-12 text-center text-xs text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} CryptoPayroll. All rights reserved.</p>
      </div>
    </div>
  );
};

export default Index;
