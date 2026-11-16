import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Native / binary packages must stay outside the server bundle.
  serverExternalPackages: ['better-sqlite3', 'ffmpeg-static'],
};

export default nextConfig;
