// next.config.js
// Compatible with Next.js 13 / 14 / 15 (App Router & Pages Router)

/** @type {import('next').NextConfig} */
const nextConfig = {

  // ── REACT STRICT MODE ───────────────────────────────────────────────
  // Enables extra runtime warnings in development. Recommended: true.
  reactStrictMode: true,

  // ── BASE PATH ───────────────────────────────────────────────────────
  // Set this if your app is served from a sub-path, e.g. /app
  // IMPORTANT: all fetch('/api/...') calls must become fetch('/app/api/...')
  // or use the `basePath` aware router.
  // basePath: '/app',

  // ── ASSET PREFIX ────────────────────────────────────────────────────
  // Use if static assets are served from a CDN different to your app origin.
  // assetPrefix: 'https://cdn.yourdomain.com',

  // ── TRAILING SLASH ──────────────────────────────────────────────────
  // false (default): /about   → canonical
  // true:            /about/  → canonical  (useful for static export + S3)
  trailingSlash: false,

  // ── OUTPUT MODE ─────────────────────────────────────────────────────
  // 'standalone' → bundles only what's needed; ideal for Docker / self-host
  // 'export'     → fully static HTML/CSS/JS (no server, no API routes)
  // omit         → default Vercel deployment (recommended for Vercel)
  // output: 'standalone',

  // ── IMAGE OPTIMIZATION ──────────────────────────────────────────────
  images: {
    // List every external hostname you load <Image src="..."> from
    remotePatterns: [
      // { protocol: 'https', hostname: 'images.unsplash.com' },
      // { protocol: 'https', hostname: '**.yourdomain.com' },
    ],
    // Disable built-in optimization if using a 3rd-party loader (e.g. Cloudinary)
    // unoptimized: true,
  },

  // ── ENVIRONMENT VARIABLES ───────────────────────────────────────────
  // Variables listed here are inlined at build time (public, no secrets!)
  // For secrets, use ONLY process.env.MY_SECRET in server code.
  // env: {
  //   NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  // },

  // ── REDIRECTS ───────────────────────────────────────────────────────
  async redirects() {
    return [
      // {
      //   source: '/old-page',
      //   destination: '/new-page',
      //   permanent: true,   // 308 (permanent) | false = 307 (temporary)
      // },
    ];
  },

  // ── REWRITES ────────────────────────────────────────────────────────
  // Proxy requests without changing the visible URL (great for hiding API origins)
  async rewrites() {
    return [
      // {
      //   source: '/api/external/:path*',
      //   destination: 'https://api.third-party.com/:path*',
      // },
    ];
  },

  // ── HEADERS ─────────────────────────────────────────────────────────
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options',        value: 'DENY' },
          { key: 'X-XSS-Protection',       value: '1; mode=block' },
        ],
      },
    ];
  },

  // ── WEBPACK CUSTOMISATION (advanced) ─────────────────────────────────
  // webpack(config, { isServer }) {
  //   // Example: add SVG as React components
  //   config.module.rules.push({
  //     test: /\.svg$/,
  //     use: ['@svgr/webpack'],
  //   });
  //   return config;
  // },

  // ── EXPERIMENTAL ────────────────────────────────────────────────────
  // experimental: {
  //   serverActions: { allowedOrigins: ['yourdomain.com'] },
  //   optimizeCss: true,
  // },
};

module.exports = nextConfig;
