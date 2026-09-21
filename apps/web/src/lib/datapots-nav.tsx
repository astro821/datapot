import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { DataPotDto } from '@datapot/shared';
import { api } from '../lib/api';

type NavCtx = {
  pots: DataPotDto[];
  refreshPots: () => Promise<void>;
};

const DatapotsNavContext = createContext<NavCtx | null>(null);

export function DatapotsNavProvider({ children }: { children: ReactNode }) {
  const [pots, setPots] = useState<DataPotDto[]>([]);

  const refreshPots = useCallback(async () => {
    try {
      setPots(await api<DataPotDto[]>('/datapots'));
    } catch {
      setPots([]);
    }
  }, []);

  useEffect(() => {
    void refreshPots();
    const onRefresh = () => void refreshPots();
    window.addEventListener('dpot:nav-refresh', onRefresh);
    return () => window.removeEventListener('dpot:nav-refresh', onRefresh);
  }, [refreshPots]);

  const value = useMemo(() => ({ pots, refreshPots }), [pots, refreshPots]);
  return <DatapotsNavContext.Provider value={value}>{children}</DatapotsNavContext.Provider>;
}

export function useDatapotsNav(): NavCtx {
  const ctx = useContext(DatapotsNavContext);
  if (!ctx) throw new Error('useDatapotsNav outside provider');
  return ctx;
}

export function notifyNavRefresh() {
  window.dispatchEvent(new Event('dpot:nav-refresh'));
}
