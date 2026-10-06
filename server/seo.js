import { readFileSync, statSync } from 'fs';
import path from 'path';

const SITE = 'Tiến Lên';
const IMAGE = '/og-image.png';
const ZOOMABLE_VIEWPORT = 'width=device-width, initial-scale=1, viewport-fit=cover';
const GAME_THEME = '#1a1a1a';
const ASSET_CACHE = 'public, max-age=31536000, immutable';

const HOME_DESCRIPTION = 'Play Tiến Lên (Tien Len), the Vietnamese card game also called Thirteen. Free in your browser for 2 to 4 players, with bots and a score tracker for the table.';
const HOME_DESCRIPTION_VI = 'Chơi tiến lên miền Nam online miễn phí ngay trên trình duyệt, cho 2 đến 4 người, có máy chơi cùng khi thiếu người. Kèm công cụ ghi điểm khi ngồi chơi ngoài đời.';

const PUBLIC_PAGES = {
  '/': {
    home: true,
    en: { title: `${SITE} (Tien Len) | Play the Vietnamese card game online`, description: HOME_DESCRIPTION },
    vi: { title: `${SITE} miền Nam online | Đánh bài tiến lên miễn phí`, description: HOME_DESCRIPTION_VI },
  },
  '/play': {
    game: true,
    en: {
      title: `Play ${SITE} online | Free card game for 2 to 4 players`,
      description: `Start a ${SITE} room and send the link to friends, or join Quick Match. Free online card game for 2 to 4 players, with bots for empty seats. No download.`,
    },
    vi: {
      title: `Chơi ${SITE} online | Game bài miễn phí cho 2 đến 4 người`,
      description: 'Tạo phòng rồi gửi link cho bạn bè, hoặc vào Ghép trận nhanh. Tiến lên miền Nam online miễn phí cho 2 đến 4 người, có máy vào chỗ trống. Không cần tải về.',
    },
  },
  '/scores': {
    en: {
      title: `${SITE} score tracker | Keep score at the table`,
      description: `Keep score when you play ${SITE} at the table. Record each game, chops and penalties, and share a link so everyone sees the totals.`,
    },
    vi: {
      title: `Ghi điểm ${SITE} | Tính điểm khi chơi ngoài đời`,
      description: 'Ghi điểm khi chơi tiến lên với bạn bè và gia đình. Lưu từng ván, chặt heo, thối heo, rồi gửi link để cả bàn cùng xem tổng điểm.',
    },
  },
  '/rules': {
    en: {
      title: `How to play ${SITE} | Rules, chops and glossary`,
      description: `${SITE} rules in plain English: card ranks, every play you can make, chopping 2s with bombs, instant wins and a glossary of terms like heo, chặt and cóng.`,
    },
    vi: {
      title: `Luật chơi ${SITE} miền Nam | Cách chơi và thuật ngữ`,
      description: 'Luật tiến lên miền Nam đầy đủ: thứ tự lá bài, các bộ được đánh, chặt heo, tới trắng, thối heo, cóng và giải thích các thuật ngữ thường gặp.',
    },
  },
  '/privacy': {
    en: {
      title: `Privacy policy | ${SITE}`,
      description: `What ${SITE} stores about you, what other players can see, and how to download or delete your data.`,
    },
    vi: {
      title: `Chính sách quyền riêng tư | ${SITE}`,
      description: `${SITE} lưu những gì về bạn, người khác thấy được gì, và cách tải về hoặc xóa dữ liệu của bạn.`,
    },
  },
  '/terms': {
    en: {
      title: `Terms of use | ${SITE}`,
      description: `The terms for using ${SITE}. Covers accounts, chips with no money value, score sessions and acceptable use.`,
    },
    vi: {
      title: `Điều khoản sử dụng | ${SITE}`,
      description: `Điều khoản khi dùng ${SITE}. Gồm tài khoản, chip không có giá trị tiền, phiên ghi điểm và quy tắc ứng xử.`,
    },
  },
};

const PRIVATE_PAGES = [
  {
    match: /^\/room\/([A-Z0-9]{4})$/i,
    title: (code) => `Join room ${code.toUpperCase()} | ${SITE}`,
    description: `You're invited to a game of ${SITE}, the Vietnamese card game. Open the link to take a seat. Free in your browser.`,
    game: true,
  },
  {
    match: /^\/scores\/join\/[a-f0-9]+$/,
    title: `Join a score tracker session | ${SITE}`,
    description: `You're invited to keep score for a ${SITE} game at the table. Sign in with Google to join.`,
  },
  { match: /^\/scores\/[a-f0-9]+$/, title: `Score tracker session | ${SITE}` },
  { match: /^\/profile$/, title: `Your profile | ${SITE}` },
  { match: /^\/u\/[A-Za-z0-9_-]+$/, title: `Player profile | ${SITE}` },
  { match: /^\/admin$/, title: `Admin | ${SITE}` },
];

const NOT_FOUND = {
  en: { title: `Page not found | ${SITE}` },
  vi: { title: `Không tìm thấy trang | ${SITE}`, description: HOME_DESCRIPTION_VI },
};

const PRIVATE_PATHS = [
  /^\/profile$/,
  /^\/admin$/,
  /^\/u\//,
  /^\/room\//,
  /^\/scores\/./,
  /^\/api(\/|$)/,
];

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function siteOrigin(req, fixed) {
  const base = (fixed ?? process.env.BETTER_AUTH_URL)?.trim();
  if (base && URL.canParse(base)) return new URL(base).origin;
  return `${req.protocol}://${req.get('host')}`;
}

function queryString(req) {
  const at = req.url.indexOf('?');
  return at === -1 ? '' : req.url.slice(at);
}

function viPath(base) {
  return base === '/' ? '/vi' : `/vi${base}`;
}

function findPage(pathname) {
  const prefixed = pathname.match(/^\/vi(\/.*)?$/);
  const base = prefixed ? prefixed[1] || '/' : pathname;
  const lang = prefixed ? 'vi' : 'en';
  if (Object.hasOwn(PUBLIC_PAGES, base)) {
    const page = PUBLIC_PAGES[base];
    return { ...page, ...page[lang], lang, base };
  }
  if (prefixed) return null;
  for (const page of PRIVATE_PAGES) {
    const m = pathname.match(page.match);
    if (m) {
      const title = typeof page.title === 'function' ? page.title(...m.slice(1)) : page.title;
      return { ...page, title, lang: 'en', noindex: true };
    }
  }
  return null;
}

function notFoundPage(pathname) {
  const lang = /^\/vi(\/|$)/.test(pathname) ? 'vi' : 'en';
  return { ...NOT_FOUND[lang], lang, noindex: true };
}

function structuredData(origin, lang) {
  const url = `${origin}/`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${url}#website`,
        name: SITE,
        alternateName: ['Tien Len', 'Thirteen'],
        url,
        inLanguage: ['en', 'vi'],
      },
      {
        '@type': 'VideoGame',
        '@id': `${url}#game`,
        name: SITE,
        alternateName: ['Tien Len', 'Thirteen', 'Tiến lên miền Nam'],
        url,
        description: lang === 'vi' ? HOME_DESCRIPTION_VI : HOME_DESCRIPTION,
        image: `${origin}${IMAGE}`,
        genre: 'Card game',
        gamePlatform: 'Web browser',
        applicationCategory: 'GameApplication',
        operatingSystem: 'Any',
        playMode: 'MultiPlayer',
        numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 4 },
        inLanguage: ['en', 'vi'],
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
        publisher: { '@id': `${url}#website` },
      },
    ],
  };
}

function headTags(page, origin, pathname) {
  const url = `${origin}${pathname}`;
  const description = page.description || HOME_DESCRIPTION;
  const tags = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    page.noindex
      ? '<meta name="robots" content="noindex" />'
      : `<link rel="canonical" href="${escapeHtml(url)}" />`,
  ];
  if (page.base) {
    const en = escapeHtml(origin + page.base);
    const vi = escapeHtml(origin + viPath(page.base));
    tags.push(
      `<link rel="alternate" hreflang="en" href="${en}" />`,
      `<link rel="alternate" hreflang="vi" href="${vi}" />`,
      `<link rel="alternate" hreflang="x-default" href="${en}" />`,
    );
  }
  tags.push(
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(origin + IMAGE)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(origin + IMAGE)}" />`,
  );
  if (page.home) {
    const json = JSON.stringify(structuredData(origin, page.lang)).replace(/</g, '\u003c');
    tags.push(`<script type="application/ld+json">${json}</script>`);
  }
  return tags.join('\n  ');
}

function renderPage(template, page, origin, pathname) {
  let html = template
    .replace(/\s*<meta name="description"[^>]*>/, '')
    .replace(/<title>[\s\S]*?<\/title>/, () => headTags(page, origin, pathname));
  if (page.game) {
    html = html.replace(/<meta name="theme-color" content="[^"]*"/, `<meta name="theme-color" content="${GAME_THEME}"`);
  } else {
    html = html.replace(/<meta name="viewport" content="[^"]*"/, `<meta name="viewport" content="${ZOOMABLE_VIEWPORT}"`);
  }
  if (page.lang === 'vi') {
    html = html
      .replace(/<html lang="[^"]*"/, '<html lang="vi"')
      .replace('<meta property="og:locale" content="en_US" />', '<meta property="og:locale" content="vi_VN" />')
      .replace('<meta property="og:locale:alternate" content="vi_VN" />', '<meta property="og:locale:alternate" content="en_US" />');
  }
  return html;
}

function robotsTxt(origin) {
  return `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${origin}/sitemap.xml\n`;
}

function sitemapXml(origin) {
  const paths = Object.keys(PUBLIC_PAGES).flatMap((base) => [base, viPath(base)]);
  const urls = paths.map((p) => `  <url>\n    <loc>${escapeHtml(origin + p)}</loc>\n  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function isFile(root, pathname) {
  try {
    const full = path.join(root, decodeURIComponent(pathname));
    return full.startsWith(root + path.sep) && statSync(full).isFile();
  } catch {
    return false;
  }
}

export function createSeo(clientDist, { origin } = {}) {
  const root = path.resolve(clientDist);
  const indexFile = path.join(root, 'index.html');
  let template = { mtime: 0, html: null };
  const loadTemplate = () => {
    try {
      const { mtimeMs } = statSync(indexFile);
      if (mtimeMs !== template.mtime) template = { mtime: mtimeMs, html: readFileSync(indexFile, 'utf8') };
    } catch {
      template = { mtime: 0, html: null };
    }
    return template.html;
  };

  return (req, res, next) => {
    const pathname = req.path;
    if (PRIVATE_PATHS.some((re) => re.test(pathname))) res.set('X-Robots-Tag', 'noindex');
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (/^\/(api|socket\.io)(\/|$)/.test(pathname)) return next();

    const clean = `/${pathname.split('/').filter(Boolean).join('/')}`;
    if (clean !== pathname) return res.redirect(301, clean + queryString(req));
    if (pathname === '/index.html') return res.redirect(301, `/${queryString(req)}`);

    const site = siteOrigin(req, origin);
    if (pathname === '/robots.txt') {
      return res.set('Cache-Control', 'public, max-age=3600').type('text/plain').send(robotsTxt(site));
    }
    if (pathname === '/sitemap.xml') {
      return res.set('Cache-Control', 'public, max-age=3600').type('application/xml').send(sitemapXml(site));
    }

    const page = findPage(pathname);
    if (!page && path.extname(pathname)) {
      if (!isFile(root, pathname)) return res.status(404).set('Cache-Control', 'no-store').type('text/plain').send('Not found');
      if (pathname.startsWith('/assets/')) res.set('Cache-Control', ASSET_CACHE);
      if (pathname === '/sw.js') res.set('Cache-Control', 'no-cache');
      return next();
    }

    const html = loadTemplate();
    if (!html) return next();
    if (!page) res.set('X-Robots-Tag', 'noindex');
    res.set('Cache-Control', 'no-cache');
    return res.status(page ? 200 : 404).type('html').send(renderPage(html, page || notFoundPage(pathname), site, pathname));
  };
}
