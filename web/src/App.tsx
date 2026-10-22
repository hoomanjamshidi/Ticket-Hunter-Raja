/**
 * پوسته‌ی داشبورد: سایدبار ناوبری، نوار وضعیت چسبان، و صفحه‌ی فعال.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  History,
  Monitor,
  Moon,
  Radar,
  Settings as SettingsIcon,
  Sun,
  Users,
} from 'lucide-react';
import { api, type Settings, type Watch } from './lib/api';
import { useLiveLog } from './lib/useLiveLog';
import { WatchesPage } from './pages/Watches';
import { LivePage } from './pages/Live';
import { HistoryPage } from './pages/History';
import { PassengersPage } from './pages/Passengers';
import { SettingsPage } from './pages/SettingsPage';
import { BrowserView } from './pages/BrowserView';
import { StatusBar } from './components/StatusBar';
import './App.css';

type PageId = 'watches' | 'browser' | 'live' | 'history' | 'passengers' | 'settings';

const NAV: { id: PageId; label: string; Icon: typeof Radar }[] = [
  { id: 'watches', label: 'رصدها', Icon: Radar },
  { id: 'browser', label: 'مرورگر', Icon: Monitor },
  { id: 'live', label: 'نتایج زنده', Icon: Activity },
  { id: 'history', label: 'تاریخچه', Icon: History },
  { id: 'passengers', label: 'مسافران', Icon: Users },
  { id: 'settings', label: 'تنظیمات', Icon: SettingsIcon },
];

export default function App() {
  const [page, setPage] = useState<PageId>('watches');
  const [watches, setWatches] = useState<Watch[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('theme') as 'dark' | 'light') ?? 'dark',
  );
  const { events, stages, connected } = useLiveLog();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  const refresh = useCallback(async () => {
    const [list, config] = await Promise.all([api.watches(), api.settings()]);
    setWatches(list);
    setSettings(config);
  }, []);

  useEffect(() => {
    void refresh();
    // وضعیت رصدها را مرتب تازه می‌کنیم تا شمارنده‌ها زنده بمانند
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="ناوبری اصلی">
        <div className="brand">
          <Radar size={20} aria-hidden="true" />
          <span>شکارچی بلیت</span>
        </div>

        <ul className="nav">
          {NAV.map(({ id, label, Icon }) => (
            <li key={id}>
              <button
                className={`nav-item${page === id ? ' is-active' : ''}`}
                onClick={() => setPage(id)}
                aria-current={page === id ? 'page' : undefined}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </button>
            </li>
          ))}
        </ul>

        <button
          className="nav-item theme-toggle"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={theme === 'dark' ? 'تغییر به تم روشن' : 'تغییر به تم تیره'}
        >
          {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          <span>{theme === 'dark' ? 'تم روشن' : 'تم تیره'}</span>
        </button>
      </nav>

      <div className="main">
        <StatusBar settings={settings} watches={watches} connected={connected} onRefresh={refresh} />

        <main className="content">
          {page === 'watches' && (
            <WatchesPage watches={watches} stages={stages} onChange={refresh} />
          )}
          {page === 'browser' && <BrowserView />}
          {page === 'live' && <LivePage watches={watches} events={events} />}
          {page === 'history' && <HistoryPage watches={watches} />}
          {page === 'passengers' && <PassengersPage />}
          {page === 'settings' && <SettingsPage settings={settings} onChange={refresh} />}
        </main>
      </div>
    </div>
  );
}
