import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    define: {
      'import.meta.env.VITE_NODE_LIGHTSTEP': JSON.stringify(env.VITE_NODE_LIGHTSTEP || '0.08'),
      'import.meta.env.VITE_NODE_LEVELMAX': JSON.stringify(env.VITE_NODE_LEVELMAX || '5'),
      'import.meta.env.VITE_NODE_HUESIZE': JSON.stringify(env.VITE_NODE_HUESIZE || '60'),
    },
  };
});