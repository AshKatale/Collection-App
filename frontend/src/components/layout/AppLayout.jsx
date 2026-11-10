import { useState, useEffect } from 'react';
import { Outlet, useLocation, NavLink } from 'react-router-dom';
import { HandCoins, FileBarChart, KeyRound, LayoutDashboard } from 'lucide-react';
import Sidebar from './Sidebar.jsx';
import Navbar from './Navbar.jsx';
import { startQueueSync } from '../../utils/offlineQueue.js';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const tabs = [
    ['/collect', 'Collect', HandCoins],
    ['/reports/daily', 'Reports', FileBarChart],
    ['/permissions', 'Permissions', KeyRound],
    ['/', 'Home', LayoutDashboard],
  ];

  // Send collections that were saved while offline as soon as we are online
  useEffect(() => startQueueSync(), []);

  // Every navigation starts at the top of the page
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar onToggleSidebar={() => setSidebarOpen((o) => !o)} />
        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-x-hidden pb-24 lg:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Phone tab bar */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 grid grid-cols-4 pb-[env(safe-area-inset-bottom)]"
        aria-label="Quick navigation"
      >
        {tabs.map(([to, label, Icon]) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? 'text-primary-600' : 'text-gray-500'}`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
