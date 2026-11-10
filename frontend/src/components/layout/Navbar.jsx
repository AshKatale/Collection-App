import { useEffect, useState } from 'react';
import { Menu, LogOut, Sun, Moon, CloudOff, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { currentTheme, setTheme } from '../../utils/theme.js';
import { pendingCount, subscribePending, flushQueue } from '../../utils/offlineQueue.js';

const roleBadgeColors = {
  ADMIN: 'bg-red-100 text-red-700',
  OWNER: 'bg-blue-100 text-blue-700',
  COLLECTOR: 'bg-green-100 text-green-700',
};

export default function Navbar({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const [theme, setThemeState] = useState(currentTheme());
  const [pending, setPending] = useState(pendingCount());
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => subscribePending(setPending), []);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  };

  const syncNow = async () => {
    setSyncing(true);
    await flushQueue();
    setSyncing(false);
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-3 sm:px-4 lg:px-6 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex-1" />

        <div className="flex items-center gap-2 sm:gap-3">
          {!online && (
            <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
              <CloudOff className="h-3.5 w-3.5" /> Offline
            </span>
          )}
          {pending > 0 && (
            <button
              onClick={syncNow}
              disabled={syncing || !online}
              className="flex items-center gap-1 text-xs font-semibold text-primary-700 bg-primary-50 px-2.5 py-1 rounded-full disabled:opacity-60"
              title="Entries saved on this device that are waiting to be sent"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {pending} to sync
            </button>
          )}

          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-gray-700 leading-tight">{user?.name || user?.email}</p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${roleBadgeColors[user?.role] || 'bg-gray-100 text-gray-700'}`}>
            {user?.role}
          </span>

          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle dark mode"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button
            onClick={logout}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 hover:text-red-500"
            title="Logout"
            aria-label="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
