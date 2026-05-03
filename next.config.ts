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
        source: "/clarity-ui96/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/clarity-ui96/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
      {
        source: "/clarity-ui96/flags",
        destination: "https://us.i.posthog.com/flags",
      },
      {
        source: "/docs",
        destination: "https://clarity-9b1741c0.mintlify.dev/docs",
      },
      {
        source: "/docs/:match*",
        destination: "https://clarity-9b1741c0.mintlify.dev/docs/:match*",
      },
    ];
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true, 
};

export default nextConfig;