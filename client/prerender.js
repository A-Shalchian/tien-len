import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const out = path.join(root, 'dist-ssr', 'pages');

const PAGES = {
  '/': null,
  '/rules': 'src/pages/Rules.jsx',
  '/privacy': 'src/pages/Privacy.jsx',
  '/terms': 'src/pages/Terms.jsx',
};

const { render } = await import(pathToFileURL(path.join(root, 'dist-ssr', 'server', 'entry-server.js')).href);
const template = readFileSync(path.join(dist, 'index.html'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(dist, '.vite', 'manifest.json'), 'utf8'));

function chunkLinks(source) {
  const chunk = source && manifest[source];
  if (!chunk) return '';
  const css = (chunk.css || []).map((file) => `<link rel="stylesheet" crossorigin href="/${file}">`);
  return [`<link rel="modulepreload" crossorigin href="/${chunk.file}">`, ...css].join('\n  ');
}

for (const [base, source] of Object.entries(PAGES)) {
  for (const pathname of [base, base === '/' ? '/vi' : `/vi${base}`]) {
    const body = await render(pathname);
    const links = chunkLinks(source);
    const html = template
      .replace('</head>', links ? `  ${links}\n</head>` : '</head>')
      .replace('<div id="root"></div>', () => `<div id="root" data-prerendered="${pathname}">${body}</div>`);
    const file = path.join(out, `${pathname === '/' ? 'index' : pathname.slice(1)}.html`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, html);
    console.log(`prerendered ${pathname}`);
  }
}
