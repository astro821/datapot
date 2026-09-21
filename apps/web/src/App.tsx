import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { UsersPage } from './pages/UsersPage';
import { SettingsPage } from './pages/SettingsPage';
import { DatapotsPage } from './pages/DatapotsPage';
import { DatapotDetailPage } from './pages/DatapotDetailPage';
import { PotDataPage } from './pages/PotDataPage';

function Protected({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  if (loading) return <div className="auth-page">로딩 중…</div>;
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function SettingsOnly({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  if (status && !status.initialized) {
    return <Navigate to="/settings" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { loading, token, status } = useAuth();

  if (loading) {
    return <div className="auth-page">로딩 중…</div>;
  }

  return (
    <Routes>
      <Route path="/setup" element={<Navigate to="/login" replace />} />
      <Route
        path="/login"
        element={
          token ? (
            <Navigate to={status?.initialized ? '/' : '/settings'} replace />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route
        path="/"
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route
          index
          element={
            <SettingsOnly>
              <DashboardPage />
            </SettingsOnly>
          }
        />
        <Route
          path="users"
          element={
            <SettingsOnly>
              <UsersPage />
            </SettingsOnly>
          }
        />
        <Route path="settings" element={<SettingsPage />} />
        <Route
          path="datapots"
          element={
            <SettingsOnly>
              <DatapotsPage />
            </SettingsOnly>
          }
        />
        <Route
          path="datapots/:id"
          element={
            <SettingsOnly>
              <DatapotDetailPage />
            </SettingsOnly>
          }
        />
        <Route
          path="datapots/:id/data"
          element={
            <SettingsOnly>
              <PotDataPage />
            </SettingsOnly>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
