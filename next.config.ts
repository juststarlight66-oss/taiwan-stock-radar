import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/taiwan-stock-radar',
  images: { unoptimized: true },
};

export default nextConfig;
