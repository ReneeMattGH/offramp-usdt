import { ReactNode, useState } from 'react';
import { Menu, Wallet } from 'lucide-react';
import { Sidebar, SidebarContent } from './Sidebar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar - Hidden on mobile */}
      <Sidebar className="hidden md:block" />

      {/* Mobile Header - Visible only on mobile */}
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 md:hidden">
        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle navigation menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 border-r-0">
            <SidebarContent onNavClick={() => setIsMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        
        <div className="flex items-center gap-2 font-semibold">
           <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center">
             <Wallet className="w-4 h-4 text-primary-foreground" />
           </div>
           <span className="text-lg tracking-tight">CryptoPayroll</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="md:ml-64 min-h-screen bg-muted/5">
        <div className="container mx-auto p-4 md:p-8 max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}
