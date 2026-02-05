import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Wallet, 
  ArrowRightLeft, 
  ShieldAlert, 
  LogOut 
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const AdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [adminUser, setAdminUser] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    const userStr = localStorage.getItem('adminUser');
    
    if (!token) {
      navigate('/admin/login');
      return;
    }

    if (userStr) {
      setAdminUser(JSON.parse(userStr));
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    navigate('/admin/login');
  };

  const navItems = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'KYC Requests', path: '/admin/kyc', icon: FileText },
    { label: 'Deposits', path: '/admin/deposits', icon: Wallet },
    { label: 'Exchange Orders', path: '/admin/orders', icon: ArrowRightLeft },
    { label: 'Users', path: '/admin/users', icon: Users },
    { label: 'Audit Logs', path: '/admin/audit', icon: ShieldAlert },
  ];

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r shadow-sm hidden md:flex flex-col">
        <div className="p-6 border-b">
          <h1 className="text-xl font-bold text-primary">Admin Panel</h1>
          <p className="text-xs text-gray-500 mt-1">
             {adminUser ? `Logged in as ${adminUser.username}` : 'Loading...'}
          </p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link to={item.path} key={item.path}>
                <Button 
                  variant={isActive ? "default" : "ghost"} 
                  className="w-full justify-start"
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t">
          <Button variant="outline" className="w-full text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
