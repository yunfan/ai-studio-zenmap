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
      'import.meta.env.VITE_TREE_COLOR_LIGHTNESS_STEP': JSON.stringify(env.VITE_TREE_COLOR_LIGHTNESS_STEP || '0.08'),
      'import.meta.env.VITE_TREE_COLOR_LEVELS_PER_HUE': JSON.stringify(env.VITE_TREE_COLOR_LEVELS_PER_HUE || '5'),
      'import.meta.env.VITE_TREE_COLOR_HUE_STEP': JSON.stringify(env.VITE_TREE_COLOR_HUE_STEP || '60'),
    },
  };
});