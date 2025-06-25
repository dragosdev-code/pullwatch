import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env variables based on mode (development, production)
  // This makes process.env.NODE_ENV available correctly
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      tailwindcss(),
      viteStaticCopy({
        targets: [
          {
            src: 'extension/offscreen/offscreen.html',
            dest: '.', // This will place it in dist/extension/offscreen/offscreen.html
          },
          // If manifest.json is not automatically copied from public/ to dist/ (it usually is),
          // you can add it here too, though Vite's default behavior should handle it.
          // {
          //   src: 'public/manifest.json',
          //   dest: ''
          // }
        ],
      }),
    ],
    resolve: {
      alias: {
        // Allows for cleaner imports if you have deep structures, e.g., '@common/types'
        // Adjust as needed for your project structure.
        '@extension': path.resolve(__dirname, 'extension'),
        '@common': path.resolve(__dirname, 'extension/common'),
        '@background': path.resolve(__dirname, 'extension/background'),
        '@offscreen': path.resolve(__dirname, 'extension/offscreen'),
        '@debug': path.resolve(__dirname, 'extension/debug'),
        '@src': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: 'dist',
      // Never minify - keep code readable for debugging
      minify: false,
      sourcemap: mode === 'development' ? 'inline' : false,
      target: 'esnext', // Ensure modern ES features are supported for service worker
      // Explicitly disable the module preload polyfill
      modulePreload: { polyfill: false },

      rollupOptions: {
        // STRICT: Only bundle what's explicitly imported from these entry points
        input: {
          // Popup: React app entry point
          popup: 'index.html',
          // Background Script: Your modular main.ts
          background: 'extension/background/main.ts',
          // Offscreen Script: Separate context
          offscreen: 'extension/offscreen/offscreenMain.ts',
        },

        // EXPLICIT MODULE HANDLING: No side effects, strict tree-shaking
        treeshake: {
          // Enable aggressive tree-shaking
          moduleSideEffects: false, // CRITICAL: No auto-executing code
          // Only include explicitly imported/exported code
          propertyReadSideEffects: false,
          // Remove unused exports
          tryCatchDeoptimization: false,
        },

        output: {
          format: 'esm', // ES modules for service worker compatibility

          // EXPLICIT OUTPUT NAMING: Clear separation of bundles
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'background') {
              return 'background.js'; // Clean background script
            }
            if (chunkInfo.name === 'offscreen') {
              return 'offscreen.js'; // Clean offscreen script
            }
            // Popup app with hash for caching
            return 'assets/[name]-[hash].js';
          },

          // STRICT CHUNKING: Prevent code leakage between contexts
          chunkFileNames: (chunkInfo) => {
            // Keep background/offscreen code separate from popup
            if (
              chunkInfo.facadeModuleId?.includes('extension/background/') ||
              chunkInfo.facadeModuleId?.includes('extension/offscreen/')
            ) {
              return '[name].js'; // No hash for extension scripts
            }
            return 'assets/[name]-[hash].js'; // Hash for popup chunks
          },

          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
    },
    // Define global constants, effectively replacing process.env.NODE_ENV
    define: {
      'process.env.NODE_ENV': JSON.stringify(env.NODE_ENV || mode || 'production'),
      // You can define other global constants here if needed
      // 'process.env.CUSTOM_VAR': JSON.stringify(env.CUSTOM_VAR || 'default_value')
    },
    // Ensure the public directory (default is 'public') is still processed for manifest.json, icons etc.
    // publicDir: 'public',
    // OPTIMIZATION: Ensure clean module boundaries
    optimizeDeps: {
      // Exclude extension-specific modules from dependency optimization
      exclude: ['@extension', '@common', '@background', '@offscreen', '@debug'],
    },
  };
});
