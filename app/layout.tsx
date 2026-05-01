import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: '台股雷達 Taiwan Stock Radar',
  description: '每日自動掃描系統｜五維度評分｜Top 10 強勢股推薦',
  keywords: ['台股', '股票', '選股', '技術分析', '掃描', 'Taiwan Stock'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body className={`${inter.className} bg-gray-50 text-gray-900 antialiased`}>
        {children}
      </body>
    </html>
  );
}
