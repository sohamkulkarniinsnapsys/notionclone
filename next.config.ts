import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: false, // Disable strict mode to prevent double renders

  // Performance optimizations
  compiler: {
    // Remove console logs in production
    removeConsole:
      process.env.NODE_ENV === "production"
        ? {
            exclude: ["error", "warn"],
          }
        : false,
  },

  // Image optimization
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  // Optimize compilation performance
  experimental: {
    // Reduce memory usage and improve build times
    optimizePackageImports: [
      "@tiptap/react",
      "@tiptap/core",
      "@tiptap/starter-kit",
      "@tiptap/extension-collaboration",
      "@tiptap/extension-collaboration-cursor",
      "@tiptap/extension-placeholder",
      "@tiptap/extension-table",
      "yjs",
      "y-prosemirror",
      "axios",
      "react-dom",
    ],
    // Disable automatic refresh to prevent WebSocket reconnections
    webpackBuildWorker: true,
    // Enable optimized CSS
    optimizeCss: true,
  },

  // Optimize server components (moved from experimental)
  serverExternalPackages: ["prisma", "@prisma/client"],

  // Turbopack configuration for Next.js 16
  turbopack: {
    // Turbopack optimizations
    rules: {
      // Optimize module resolution
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },

  // Production optimizations
  productionBrowserSourceMaps: false,
  poweredByHeader: false,

  // Compression
  compress: true,

  // Reduce HMR refresh frequency to prevent WebSocket disconnections
  onDemandEntries: {
    // Keep pages in memory longer to prevent unnecessary reloads
    maxInactiveAge: 60 * 1000, // 60 seconds
    pagesBufferLength: 5,
  },

  // Headers for security and caching
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "origin-when-cross-origin",
          },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },

  // Webpack optimization for production
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      // Production optimizations
      config.optimization = {
        ...config.optimization,
        moduleIds: "deterministic",
        runtimeChunk: "single",
        splitChunks: {
          chunks: "all",
          maxInitialRequests: 25,
          minSize: 20000,
          cacheGroups: {
            default: false,
            vendors: false,
            // React chunk - highest priority
            react: {
              name: "react",
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              chunks: "all",
              priority: 50,
              reuseExistingChunk: true,
              enforce: true,
            },
            // Tiptap editor chunk - load separately
            tiptap: {
              name: "tiptap",
              test: /[\\/]node_modules[\\/](@tiptap|prosemirror-[^/]+)[\\/]/,
              chunks: "async",
              priority: 40,
              reuseExistingChunk: true,
            },
            // Y.js collaboration - load separately
            yjs: {
              name: "yjs",
              test: /[\\/]node_modules[\\/](yjs|y-prosemirror|y-websocket|y-protocols|lib0)[\\/]/,
              chunks: "async",
              priority: 35,
              reuseExistingChunk: true,
            },
            // Vendor chunk
            vendor: {
              name: "vendor",
              chunks: "all",
              test: /[\\/]node_modules[\\/]/,
              priority: 20,
              reuseExistingChunk: true,
            },
            // Common chunk
            common: {
              name: "common",
              minChunks: 2,
              chunks: "all",
              priority: 10,
              reuseExistingChunk: true,
              enforce: true,
            },
          },
        },
        minimize: true,
      };
    }

    // Performance optimizations
    config.performance = {
      hints: false,
      maxEntrypointSize: 512000,
      maxAssetSize: 512000,
    };

    return config;
  },
};

export default nextConfig;
