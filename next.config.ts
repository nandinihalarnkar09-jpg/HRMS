import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // postgres.js must run in Node, not be bundled for the edge
  serverExternalPackages: ['postgres', '@electric-sql/pglite'],
  poweredByHeader: false,
  // No floating Next.js badge in the local/offline app (cleaner look for demos)
  devIndicators: false,
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
};

export default nextConfig;
