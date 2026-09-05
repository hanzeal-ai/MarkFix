import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@markfix/api-client', '@markfix/contracts'] })],
  },
  preload: {
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
});
