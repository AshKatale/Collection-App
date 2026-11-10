import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/common/ProtectedRoute.jsx';
import RoleGuard from './components/common/RoleGuard.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import Loading from './components/common/Loading.jsx';
import { useAuth } from './context/AuthContext.jsx';

import Login from './pages/Login.jsx';

// Every screen is its own chunk: the first load only downloads what is needed
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Collect = lazy(() => import('./pages/Collect.jsx'));
const Entries = lazy(() => import('./pages/Entries.jsx'));
const Customers = lazy(() => import('./pages/Customers.jsx'));
const Collectors = lazy(() => import('./pages/Collectors.jsx'));
const Permissions = lazy(() => import('./pages/Permissions.jsx'));
const DailyReport = lazy(() => import('./pages/reports/DailyReport.jsx'));
const MonthlyReport = lazy(() => import('./pages/reports/MonthlyReport.jsx'));
const YearlyReport = lazy(() => import('./pages/reports/YearlyReport.jsx'));
const CustomerReport = lazy(() => import('./pages/reports/CustomerReport.jsx'));
const Users = lazy(() => import('./pages/admin/Users.jsx'));
const Settings = lazy(() => import('./pages/admin/Settings.jsx'));

const guard = (roles, element) => <RoleGuard roles={roles}>{element}</RoleGuard>;

/** Collectors land straight on the Collect screen. */
function Home() {
  const { user } = useAuth();
  return user?.role === 'COLLECTOR' ? <Navigate to="/collect" replace /> : <Dashboard />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route
            path="/"
            element={
              <Suspense fallback={<Loading />}>
                <Home />
              </Suspense>
            }
          />
          {[
            ['/collect', ['COLLECTOR', 'OWNER', 'ADMIN'], <Collect />],
            ['/entries', ['OWNER', 'ADMIN'], <Entries />],
            ['/customers', ['OWNER', 'ADMIN'], <Customers />],
            ['/collectors', ['OWNER', 'ADMIN'], <Collectors />],
            ['/reports/daily', ['OWNER', 'ADMIN', 'COLLECTOR'], <DailyReport />],
            ['/permissions', ['OWNER', 'ADMIN', 'COLLECTOR'], <Permissions />],
            ['/reports/monthly', ['OWNER', 'ADMIN', 'COLLECTOR'], <MonthlyReport />],
            ['/reports/yearly', ['OWNER', 'ADMIN', 'COLLECTOR'], <YearlyReport />],
            ['/reports/customer', ['OWNER', 'ADMIN', 'COLLECTOR'], <CustomerReport />],
            ['/admin/users', ['ADMIN'], <Users />],
            ['/admin/settings', ['ADMIN', 'OWNER'], <Settings />],
          ].map(([path, roles, element]) => (
            <Route
              key={path}
              path={path}
              element={<Suspense fallback={<Loading />}>{guard(roles, element)}</Suspense>}
            />
          ))}
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
