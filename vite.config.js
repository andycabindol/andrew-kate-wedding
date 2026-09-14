import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const base = '/';
const prodPages = ['wedding', 'reception', 'prepare', 'party', 'rsvp', 'admin'];
const devOnlyPages = ['gallery'];

function rewriteCleanUrl(url, pages) {
  if (!url) return url;
  const queryIndex = url.indexOf('?');
  const pathname = queryIndex === -1 ? url : url.slice(0, queryIndex);
  const search = queryIndex === -1 ? '' : url.slice(queryIndex);
  const prefix = base.replace(/\/$/, '');

  for (const page of pages) {
    if (pathname === `${prefix}/${page}` || pathname === `${prefix}/${page}/`) {
      return `${prefix}/${page}.html${search}`;
    }
  }

  return url;
}

function cleanHtmlUrls(pages) {
  const rewrite = (req, _res, next) => {
    req.url = rewriteCleanUrl(req.url, pages);
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
      for (const page of pages) {
        const destDir = resolve(dist, page);
        mkdirSync(destDir, { recursive: true });
        copyFileSync(resolve(dist, `${page}.html`), resolve(destDir, 'index.html'));
      }
    },
  };
}

export default defineConfig(({ command }) => {
  const isDev = command === 'serve';
  const cleanPages = isDev ? [...prodPages, ...devOnlyPages] : prodPages;

  return {
    // Custom domain: https://katieandrew.wedding/
    base,
    root: '.',
    publicDir: 'public',
    plugins: [cleanHtmlUrls(cleanPages)],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          wedding: resolve(__dirname, 'wedding.html'),
          reception: resolve(__dirname, 'reception.html'),
          prepare: resolve(__dirname, 'prepare.html'),
          party: resolve(__dirname, 'party.html'),
          rsvp: resolve(__dirname, 'rsvp.html'),
          admin: resolve(__dirname, 'admin.html'),
        },
      },
    },
  };
});
