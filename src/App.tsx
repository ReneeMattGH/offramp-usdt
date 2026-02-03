import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";

// Pages
// import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Deposit from "./pages/Deposit";
import Withdraw from "./pages/Withdraw";
import WithdrawUSDT from "./pages/WithdrawUSDT";
import Transactions from "./pages/Transactions";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex items-center gap-2">
          <div className="w-2 h-2 bg-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-foreground">
            <h1 className="text-2xl font-bold text-destructive">Authentication Failed</h1>
            <p className="text-muted-foreground">Could not log in automatically to the demo account.</p>
            <div className="flex gap-4">
                <button 
                    onClick={() => window.location.reload()} 
                    className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                >
                    Retry
                </button>
                <button 
                    onClick={() => {
                        localStorage.clear();
                        window.location.reload();
                    }} 
                    className="px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded transition-colors"
                >
                    Reset & Retry
                </button>
            </div>
        </div>
    );
  }

  return <>{children}</>;
}

// Public Route wrapper (redirect if authenticated)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex items-center gap-2">
          <div className="w-2 h-2 bg-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      
      {/* Protected routes */}
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      } />
      <Route path="/deposit" element={
        <ProtectedRoute>
          <Deposit />
        </ProtectedRoute>
      } />
      <Route path="/withdraw" element={
        <ProtectedRoute>
          <Withdraw />
        </ProtectedRoute>
      } />
      <Route path="/withdraw-usdt" element={
        <ProtectedRoute>
          <WithdrawUSDT />
        </ProtectedRoute>
      } />
      <Route path="/transactions" element={
        <ProtectedRoute>
          <Transactions />
        </ProtectedRoute>
      } />
      <Route path="/settings" element={
        <ProtectedRoute>
          <Settings />
        </ProtectedRoute>
      } />
      <Route path="/admin" element={
        <ProtectedRoute>
          <Admin />
        </ProtectedRoute>
      } />

      {/* Catch-all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
