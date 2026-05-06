'use client';
import dynamic from 'next/dynamic';

const MainDashboard = dynamic(
  () => import('@/components/MainDashboard'),
  { ssr: false }
);

export default function Home() {
  return <MainDashboard />;
}
