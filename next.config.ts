import type {NextConfig}from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com', // For YouTube thumbnails
        port: '',
        pathname: '/**',
      }
    ],
    // For data URIs, next/image handles them automatically.
    // No specific hostname configuration is needed for data URIs.
    dangerouslyAllowSVG: true, // If SVGs are used and need this.
    contentDispositionType: 'attachment', 
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
