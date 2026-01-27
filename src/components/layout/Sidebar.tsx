import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  Receipt, 
  Settings, 
  LogOut,
  Wallet
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Deposit', href: '/deposit', icon: ArrowDownToLine },
  { name: 'Exchange (INR)', href: '/withdraw', icon: ArrowUpFromLine },
  { name: 'Withdraw (USDT)', href: '/withdraw-usdt', icon: Wallet },
  { name: 'Transactions', href: '/transactions', icon: Receipt },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const location = useLocation();
  const { logout, user } = useAuth();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center">
            <Wallet className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg tracking-tight">CryptoPayroll</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                'nav-link',
                isActive ? 'nav-link-active' : 'nav-link-inactive'
              )}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* User & Logout */}
      <div className="p-4 border-t border-sidebar-border">
        {user && (
          <div className="mb-3 px-4 py-2">
            <p className="text-sm font-medium truncate">{user.account_holder_name}</p>
            <p className="text-xs text-muted-foreground">A/C: ••••{user.account_number.slice(-4)}</p>
          </div>
        )}
        <button
          onClick={logout}
          className="nav-link nav-link-inactive w-full justify-start"
        >
          <LogOut className="w-5 h-5" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
