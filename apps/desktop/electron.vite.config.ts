import { serviceUrls } from '../../packages/contracts/src/service-config';
import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  main: {
    define: {
      'import.meta.env.MAIN_VITE_MANUAL_UPDATES': JSON.stringify(
        process.env.MARKFIX_DESKTOP_UPDATE_MODE === 'manual',
      ),
      'import.meta.env.MAIN_VITE_SERVICE_URLS': JSON.stringify(
        serviceUrls(mode, loadEnv(mode, process.cwd(), 'MARKFIX_').MARKFIX_SERVICE_ORIGIN),
      ),
    },
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@markfix/api-client', '@markfix/contracts', '@markfix/annotation-model'],
      }),
    ],
  },
  preload: {
    define: {
      'import.meta.env.PRELOAD_VITE_MANUAL_UPDATES': JSON.stringify(
        process.env.MARKFIX_DESKTOP_UPDATE_MODE === 'manual',
      ),
    },
    plugins: [
      externalizeDepsPlugin({ exclude: ['@markfix/contracts', '@markfix/anchor-core', 'zod'] }),
    ],
    build: {
      rollupOptions: {
        input: {
          shell: resolve(import.meta.dirname, 'src/shell-preload/index.ts'),
          target: resolve(import.meta.dirname, 'src/target-runtime/index.ts'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: { plugins: [react(), tailwindcss()] },
}));
