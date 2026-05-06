'use client';
import dynamic from 'next/dynamic';

const TrackingDashboard = dynamic(
  () => import('@/components/TrackingDashboard'),
  { ssr: false }
);

export default function TrackingPage() {
  return <TrackingDashboard />;
}
