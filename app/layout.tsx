import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: '台股雷達 Taiwan Stock Radar',
  description: '每日自動掃錨系統｜五維度評分｜Top 10 強勢股推薦｜深色交易終端介面',
  keywords: ['台股', '股票', '選股', '技術分析', '掃錨', 'Taiwan Stock'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className="dark">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body className={`${inter.className} bg-gray-950 text-gray-100 antialiased`}>
        {children}
      </body>
    </html>
  );
}
