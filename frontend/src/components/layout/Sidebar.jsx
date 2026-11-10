import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  HandCoins,
  ListChecks,
  Users,
  Footprints,
  FileBarChart,
  ShieldCheck,
  KeyRound,
  ChevronDown,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { getAccessRequests } from '../../api/access.js';

const menuItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/', roles: ['ADMIN', 'OWNER', 'COLLECTOR'] },
  { label: 'Collect', icon: HandCoins, path: '/collect', roles: ['COLLECTOR', 'OWNER', 'ADMIN'] },
  { label: 'Entries', icon: ListChecks, path: '/entries', roles: ['OWNER', 'ADMIN'] },
  { label: 'Customers', icon: Users, path: '/customers', roles: ['OWNER', 'ADMIN'] },
  { label: 'Collectors', icon: Footprints, path: '/collectors', roles: ['OWNER', 'ADMIN'] },
  { label: 'Permissions', icon: KeyRound, path: '/permissions', roles: ['OWNER', 'ADMIN', 'COLLECTOR'], badge: true },
  {
    label: 'Reports',
    icon: FileBarChart,
    roles: ['OWNER', 'ADMIN', 'COLLECTOR'],
    children: [
      { label: 'Daily (today)', path: '/reports/daily', roles: ['OWNER', 'ADMIN', 'COLLECTOR'] },
      { label: 'Monthly', path: '/reports/monthly', roles: ['OWNER', 'ADMIN', 'COLLECTOR'] },
      { label: 'Yearly', path: '/reports/yearly', roles: ['OWNER', 'ADMIN', 'COLLECTOR'] },
      { label: 'Customer', path: '/reports/customer', roles: ['OWNER', 'ADMIN', 'COLLECTOR'] },
    ],
  },
  {
    label: 'Admin',
    icon: ShieldCheck,
    roles: ['ADMIN'],
    children: [
      { label: 'Users', path: '/admin/users', roles: ['ADMIN'] },
      { label: 'Settings', path: '/admin/settings', roles: ['ADMIN'] },
    ],
  },
];

const linkBase = 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors';
const linkOn = 'text-primary-600 bg-primary-50';
const linkOff = 'text-gray-600 hover:bg-gray-100';

export default function Sidebar({ isOpen, onClose }) {
  const { user } = useAuth();
  const location = useLocation();
  const [expandedMenus, setExpandedMenus] = useState({});
  const [pendingCount, setPendingCount] = useState(0);

  // Owners / admins see how many collector requests wait for a decision
  useEffect(() => {
    if (user?.role !== 'OWNER' && user?.role !== 'ADMIN') return;
    getAccessRequests({ status: 'PENDING' })
      .then((res) => setPendingCount(res.data?.data?.length || 0))
      .catch(() => {});
  }, [user?.role, location.pathname]);

  const role = user?.role;
  const items = menuItems
    .filter((item) => item.roles.includes(role))
    .map((item) => (item.children ? { ...item, children: item.children.filter((c) => c.roles.includes(role)) } : item));

  const isChildActive = (children) => children?.some((child) => location.pathname === child.path);

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />}

      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:z-auto flex-shrink-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Main navigation"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-primary-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-lg">S</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-gray-800 leading-tight truncate">Siddhivinayak Mandal</h1>
              <p className="text-xs text-gray-500">Daily Collection</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100" aria-label="Close menu">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <nav className="px-3 py-4 space-y-1 overflow-y-auto h-[calc(100%-73px)]">
          {items.map((item) => {
            const Icon = item.icon;
            if (item.children) {
              const active = isChildActive(item.children);
              const expanded = expandedMenus[item.label] ?? active;
              return (
                <div key={item.label}>
                  <button
                    onClick={() => setExpandedMenus((prev) => ({ ...prev, [item.label]: !expanded }))}
                    className={`${linkBase} w-full justify-between ${active ? linkOn : linkOff}`}
                    aria-expanded={expanded}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-5 w-5" />
                      {item.label}
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  </button>
                  {expanded && (
                    <div className="ml-8 mt-1 space-y-1">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.path}
                          to={child.path}
                          onClick={onClose}
                          className={({ isActive }) =>
                            `block px-3 py-2 rounded-lg text-sm transition-colors ${
                              isActive ? 'text-primary-600 bg-primary-50 font-medium' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                            }`
                          }
                        >
                          {child.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                onClick={onClose}
                className={({ isActive }) => `${linkBase} ${isActive ? linkOn : linkOff}`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
                {item.badge && pendingCount > 0 && (
                  <span className="ml-auto bg-amber-500 text-white text-xs font-bold rounded-full px-2 py-0.5">{pendingCount}</span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
