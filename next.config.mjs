/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@prisma/client'],
  experimental: {
    serverActions: {
      bodySizeLimit: '200mb'
    }
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Cache-Control', value: 'no-store' }
        ]
      }
    ];
  }
};

export default nextConfig;
