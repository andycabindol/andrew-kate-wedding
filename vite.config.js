import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        wedding: resolve(__dirname, 'wedding.html'),
        reception: resolve(__dirname, 'reception.html'),
      },
    },
  },
});
