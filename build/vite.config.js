// vite.config.js
// Works for Vite + React, Vite + Vue, and plain Vite projects
// Pair with vercel.json "rewrites" for SPA client-side routing support

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';   // swap for @vitejs/plugin-vue if using Vue
import path from 'path';

export default defineConfig(({ mode }) => {
  // Load .env / .env.production etc. — gives access to VITE_* vars in config
  const env = loadEnv(mode, process.cwd(), '');

  return {

    // ── PLUGINS ─────────────────────────────────────────────────────
    plugins: [
      react(),
      // vue(),        // uncomment for Vue
    ],

    // ── BASE PATH ───────────────────────────────────────────────────
    // '/'      → app is served from the root (default, use for Vercel)
    // '/app/'  → app is served from a sub-path
    // Must match vercel.json "rewrites" source pattern if using a sub-path.
    base: '/',

    // ── RESOLVE ALIASES ─────────────────────────────────────────────
    // Lets you write `import Foo from '@/components/Foo'` instead of long relative paths
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        // '@components': path.resolve(__dirname, './src/components'),
        // '@utils':      path.resolve(__dirname, './src/utils'),
      },
    },

    // ── BUILD OUTPUT ────────────────────────────────────────────────
    // Vercel expects output in 'dist' by default for Vite projects.
    // If you change this, update vercel.json "outputDirectory" to match.
    build: {
      outDir: 'dist',           // ← must match vercel.json "outputDirectory"
      emptyOutDir: true,
      sourcemap: mode === 'development',   // source maps in dev only

      rollupOptions: {
        output: {
          // Split vendor code into a separate chunk for better caching
          manualChunks(id) {
            if (id.includes('node_modules')) {
              return 'vendor';
            }
          },
        },
      },
    },

    // ── DEV SERVER ──────────────────────────────────────────────────
    server: {
      port: 3000,
      open: true,       // auto-open browser on `vite dev`

      // Proxy API calls in development so you don't hit CORS issues.
      // In production on Vercel, API routes handle this themselves.
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:8000',
          changeOrigin: true,
          // rewrite: (path) => path.replace(/^\/api/, ''), // strip /api prefix
        },
      },
    },

    // ── PREVIEW SERVER (vite preview = local prod simulation) ────────
    preview: {
      port: 4173,
      // Simulate the SPA rewrite rule that vercel.json provides in prod.
      // Without this, `vite preview` will also 404 on deep routes.
      // Run: vercel dev   — to test with actual Vercel routing locally.
    },

    // ── ENVIRONMENT VARIABLE EXPOSURE ───────────────────────────────
    // Only VITE_* prefixed vars are exposed to client code.
    // Never put secrets (API keys, DB passwords) in VITE_* vars.
    // Access in code via: import.meta.env.VITE_MY_VAR
    // define: {
    //   __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    // },

    // ── CSS ─────────────────────────────────────────────────────────
    css: {
      // postcss: { plugins: [tailwindcss(), autoprefixer()] }, // if not using postcss.config.js
      devSourcemap: true,
    },

  };
});
