/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Disable static optimization for pages that use useSearchParams
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['ws', 'bufferutil', 'utf-8-validate'],
  },
  // Optimize for Vercel free tier
  images: {
    unoptimized: true,
  },
  // Remove console statements in production
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error'] // Keep only error logs if needed
    } : false,
  },
  // Externalize Node.js-only packages (like ws) to prevent webpack bundling
  webpack: (config, { isServer }) => {
    if (isServer) {
      // More aggressive externalization for ws
      config.resolve.fallback = {
        ...config.resolve.fallback,
        ws: false,
        bufferutil: false,
        'utf-8-validate': false,
      };
      
      // Externalize ws and its dependencies
      const originalExternals = config.externals;
      const wsExternals = {
        'ws': 'commonjs ws',
        'bufferutil': 'commonjs bufferutil',
        'utf-8-validate': 'commonjs utf-8-validate',
      };
      
      if (Array.isArray(originalExternals)) {
        config.externals = [...originalExternals, wsExternals];
      } else if (typeof originalExternals === 'function') {
        config.externals = [
          originalExternals,
          ({ request }, callback) => {
            if (request === 'ws' || request === 'bufferutil' || request === 'utf-8-validate') {
              return callback(null, `commonjs ${request}`);
            }
            callback();
          }
        ];
      } else {
        config.externals = [originalExternals, wsExternals];
      }
    }
    return config;
  },
  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Content-Security-Policy',
            value: process.env.NODE_ENV === 'development'
              ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' wss: https: ws:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;"
              : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' wss: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;"
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          }
        ]
      }
    ]
  }
}

module.exports = nextConfig

