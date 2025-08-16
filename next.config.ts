import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['@mantine/core', '@mantine/hooks'],
  },
  images: {
    remotePatterns: [
      new URL('https://1uzmxhfxmhpovkua.public.blob.vercel-storage.com/**'),
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.pravatar.cc',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://clarity.rocktangle.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://clarity.rocktangle.com/:path*',
      },
      {
        source: '/ingest/flags',
        destination: 'https://clarity.rocktangle.com/flags',
      },
    ];
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export default nextConfig;