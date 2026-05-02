import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = {
  themeColor: '#030712',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: '台股雷達 Taiwan Stock Radar — 每日 AI 選股系統',
  description: '每日 22:55 自動掃描全市場 2100+ 檔，五維度 AI 評分（技術面、基本面、消息面、市場情緒、籌碼面），精選 Top 10 強勢反轉股，提供明確進出場策略。',
  keywords: ['台股', '股票選股', '技術分析', 'AI 選股', '飆股', '掃描系統', 'Taiwan Stock', '每日推薦', '強勢股'],
  authors: [{ name: 'Taiwan Stock Radar' }],
  openGraph: {
    title: '台股雷達 — 每日 AI 五維度選股系統',
    description: '每日掃描 2100+ 檔台股，AI 五維度評分精選 Top 10 強勢反轉機會',
    url: 'https://juststarlight66-oss.github.io/taiwan-stock-radar/',
    siteName: '台股雷達',
    locale: 'zh_TW',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '台股雷達 — 每日 AI 五維度選股',
    description: '每日掃描 2100+ 檔台股，精選 Top 10 強勢反轉機會',
  },
  robots: { index: true, follow: true },
  manifest: '/taiwan-stock-radar/manifest.json',
  icons: {
    apple: '/taiwan-stock-radar/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className="dark">
      <head>
        <meta charSet="utf-8" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
      </head>
      <body className={`${inter.className} bg-gray-950 text-gray-100 antialiased`}>
        {children}
      </body>
    </html>
  );
}
