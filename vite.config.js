import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const base = '/';
const cleanPages = ['wedding', 'reception', 'rsvp', 'admin'];

function rewriteCleanUrl(url) {
  if (!url) return url;
  const queryIndex = url.indexOf('?');
  const pathname = queryIndex === -1 ? url : url.slice(0, queryIndex);
  const search = queryIndex === -1 ? '' : url.slice(queryIndex);
  const prefix = base.replace(/\/$/, '');

  for (const page of cleanPages) {
    if (pathname === `${prefix}/${page}` || pathname === `${prefix}/${page}/`) {
      return `${prefix}/${page}.html${search}`;
    }
  }

  return url;
}

function cleanHtmlUrls() {
  const rewrite = (req, _res, next) => {
    req.url = rewriteCleanUrl(req.url);
    next();
  };

  return {
    name: 'clean-html-urls',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
    closeBundle() {
      const dist = resolve(__dirname, 'dist');
      for (const page of cleanPages) {
        const destDir = resolve(dist, page);
        mkdirSync(destDir, { recursive: true });
        copyFileSync(resolve(dist, `${page}.html`), resolve(destDir, 'index.html'));
      }
    },
  };
}

export default defineConfig({
  // Custom domain: https://katieandrew.wedding/
  base,
  root: '.',
  publicDir: 'public',
  plugins: [cleanHtmlUrls()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        wedding: resolve(__dirname, 'wedding.html'),
        reception: resolve(__dirname, 'reception.html'),
        rsvp: resolve(__dirname, 'rsvp.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
});
