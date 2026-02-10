import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  async rewrites() {
    const configuredOrigin = process.env.CLOUD_DRIVE_API_ORIGIN?.trim();
    let origin: URL;
    try {
      origin = new URL(configuredOrigin || 'http://127.0.0.1:3001');
    } catch {
      throw new Error('CLOUD_DRIVE_API_ORIGIN must be a valid HTTP(S) origin.');
    }
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
      throw new Error('CLOUD_DRIVE_API_ORIGIN must be an HTTP(S) origin without credentials, path, query, or fragment.');
    }
    if (process.env.VERCEL === '1' && (!configuredOrigin || origin.protocol !== 'https:')) {
      throw new Error('Vercel requires CLOUD_DRIVE_API_ORIGIN to be set to the HTTPS origin of the backend.');
    }
    return [{ source: '/api/v1/:path*', destination: `${origin.origin}/api/v1/:path*` }];
  },
};

export default config;
