'use client';
import { Activity, Radio, History, TrendingUp, List, Radar, Clock, GitFork, Search } from 'lucide-react';
import { useState, useEffect } from 'react';

const BASE = '/taiwan-stock-radar';

const NAV_ITEMS = [
  { label: '每日推薦',   href: `${BASE}/`,          icon: <Activity className="w-3.5 h-3.5" /> },
  { label: '盤中監控',   href: `${BASE}/intraday`,   icon: <Radio className="w-3.5 h-3.5" /> },
  { label: '歷史查詢',   href: `${BASE}/history`,    icon: <History className="w-3.5 h-3.5" /> },
  { label: '追蹤儀表板', href: `${BASE}/tracking`,   icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { label: '族群動態',   href: `${BASE}/all`,        icon: <List className="w-3.5 h-3.5" /> },
  { label: '自主檢查',   href: `${BASE}/selfcheck`,  icon: <Search className="w-3.5 h-3.5" /> },
] as const;

interface TopNavProps {
  rightSlot?: React.ReactNode;
  onInfoClick?: () => void;
}

export default function TopNav({ rightSlot, onInfoClick }: TopNavProps) {
  const [now, setNow] = useState('');
  const [pathname, setPathname] = useState('');

  useEffect(() => {
    // Use window.location instead of usePathname() for static export compatibility
    setPathname(window.location.pathname);
  }, []);

  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString('zh-TW', {
          timeZone: 'Asia/Taipei',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  function isActive(href: string) {
    if (!pathname) return false;
    if (href === `${BASE}/`) {
      return pathname === `${BASE}/` || pathname === BASE || pathname === '/';
    }
    return pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur shadow-sm">
      <div className="max-w-screen-xl mx-auto px-4">
        <div className="flex items-center h-14 gap-3 py-2">
          {/* Logo */}
          <a href={`${BASE}/`} className="flex items-center gap-2 shrink-0 group">
            <div className="relative w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center group-hover:bg-sky-500/30 transition-colors">
              <Radar className="w-4 h-4 text-sky-400" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold text-gray-900 text-sm tracking-wide">台股雷達</span>
              <span className="text-gray-500 text-[10px] hidden sm:inline">Taiwan Stock Radar</span>
            </div>
            <span className="hidden sm:inline text-[9px] bg-sky-500/20 text-sky-600 border border-sky-500/30 px-1.5 py-0.5 rounded-full font-mono">
              v3.1
            </span>
          </a>

          {/* Nav links */}
          <nav className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-hide">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    active
                      ? 'bg-sky-50 text-sky-700 border border-sky-300'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </a>
              );
            })}
          </nav>

          {/* Right slot */}
          <div className="flex items-center gap-2 shrink-0">
            {now && (
              <span className="text-gray-400 text-[11px] hidden md:flex items-center gap-1 font-mono">
                <Clock className="w-3 h-3" />{now}
              </span>
            )}
            {onInfoClick && (
              <button
                onClick={onInfoClick}
                className="w-7 h-7 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 flex items-center justify-center transition-colors"
                title="免責聲明"
              >
                <span className="text-[10px] text-gray-500 font-medium">i</span>
              </button>
            )}
            {rightSlot}
            <a
              href="https://github.com/juststarlight66-oss/taiwan-stock-radar"
              target="_blank"
              rel="noopener noreferrer"
              className="w-7 h-7 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 flex items-center justify-center transition-colors"
              title="GitHub"
            >
              <GitFork className="w-3.5 h-3.5 text-gray-500" />
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
