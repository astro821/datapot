import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { BrandLogo } from './BrandLogo';
import { DatapotsNavProvider, useDatapotsNav } from '../lib/datapots-nav';
import { useT } from '../i18n';
import {
  IconDashboard,
  IconManage,
  IconPot,
  IconSettings,
  IconUsers,
} from './Icons';

function NavItem({
  to,
  end,
  title,
  disabled,
  children,
}: {
  to: string;
  end?: boolean;
  title?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  if (disabled) {
    return (
      <span className="dpot-nav__item dpot-nav__item--disabled" title={title} aria-disabled="true">
        {children}
      </span>
    );
  }
  return (
    <NavLink
      to={to}
      end={end}
      title={title}
      className={({ isActive }) =>
        isActive ? 'dpot-nav__item active' : 'dpot-nav__item'
      }
    >
      {children}
    </NavLink>
  );
}

function SidebarNav() {
  const t = useT();
  const { pots } = useDatapotsNav();
  const { status } = useAuth();
  const settingsOnly = Boolean(status && !status.initialized);

  return (
    <nav className="dpot-nav">
      <div className="dpot-nav-section">
        <NavItem to="/" end disabled={settingsOnly}>
          <IconDashboard />
          <span>{t('nav.dashboard')}</span>
        </NavItem>
      </div>

      <div className="dpot-nav-section">
        <div className="dpot-nav-section__label">{t('nav.datapots')}</div>
        {pots.length === 0 ? (
          <div className="dpot-nav-empty">{t('nav.noPots')}</div>
        ) : (
          pots.map((p) => (
            <NavItem
              key={p.id}
              to={`/datapots/${p.id}/data`}
              title={`${p.name} (:${p.port})`}
              disabled={settingsOnly}
            >
              <IconPot />
              <span>{p.name}</span>
            </NavItem>
          ))
        )}
      </div>

      <div className="dpot-nav-section">
        <div className="dpot-nav-section__label">{t('nav.system')}</div>
        <NavItem to="/users" disabled={settingsOnly}>
          <IconUsers />
          <span>{t('nav.users')}</span>
        </NavItem>
        <NavItem to="/settings">
          <IconSettings />
          <span>{t('nav.settings')}</span>
        </NavItem>
        <NavItem to="/datapots" end disabled={settingsOnly}>
          <IconManage />
          <span>{t('nav.manage')}</span>
        </NavItem>
      </div>
    </nav>
  );
}

function Shell() {
  const t = useT();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="dpot-shell">
      <aside className="dpot-sidebar">
        <div className="dpot-brand">
          <BrandLogo size={28} />
        </div>
        <SidebarNav />
      </aside>
      <div className="dpot-main">
        <header className="dpot-header">
          <div style={{ fontWeight: 600, color: 'var(--slate-700)' }}>{t('nav.console')}</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--slate-500)' }}>{user?.username}</span>
            <button
              className="dpot-btn"
              type="button"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              {t('nav.logout')}
            </button>
          </div>
        </header>
        <main className="dpot-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AppLayout() {
  return (
    <DatapotsNavProvider>
      <Shell />
    </DatapotsNavProvider>
  );
}
