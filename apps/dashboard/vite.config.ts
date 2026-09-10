import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.MARKFIX_SERVICE_ORIGIN': JSON.stringify(
      loadEnv(mode, process.cwd(), 'MARKFIX_').MARKFIX_SERVICE_ORIGIN || '',
    ),
  },
}));
