import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import express from 'express';
import { createSeo } from './seo.js';

const ORIGIN = 'https://tienlen.example';
const TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta name="viewport" content="width=device-width, user-scalable=no" />
  <title>Default</title>
  <meta name="description" content="Default description" />
  <meta name="theme-color" content="#2a0907" />
</head>
<body><div id="root"></div></body>
</html>`;

let dist;
let server;
let base;

before(async () => {
  dist = mkdtempSync(path.join(tmpdir(), 'seo-test-'));
  writeFileSync(path.join(dist, 'index.html'), TEMPLATE);
  writeFileSync(path.join(dist, 'sw.js'), 'self');
  mkdirSync(path.join(dist, 'assets'));
  writeFileSync(path.join(dist, 'assets', 'index-abc.js'), 'console');

  const app = express();
  app.use(createSeo(dist, { origin: ORIGIN }));
  app.use(express.static(dist, { index: false }));
  app.get('/api/thing', (req, res) => res.json({ ok: true }));
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  rmSync(dist, { recursive: true, force: true });
});

const get = (p) => fetch(base + p, { redirect: 'manual' });

test('home page gets its own title, canonical, social tags and JSON-LD', async () => {
  const res = await get('/');
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-robots-tag'), null);
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  assert.match(html, /<title>Tiến Lên \(Tien Len\) \| Play the Vietnamese card game online<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/tienlen\.example\/" \/>/);
  assert.match(html, /<meta property="og:image" content="https:\/\/tienlen\.example\/og-image\.png" \/>/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.equal(html.match(/name="description"/g).length, 1);
  assert.doesNotMatch(html, /Default/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/);
});

test('each public page has a unique title and a self canonical', async () => {
  const titles = new Set();
  for (const p of ['/play', '/scores', '/privacy', '/terms']) {
    const res = await get(p);
    const html = await res.text();
    assert.equal(res.status, 200, p);
    assert.equal(res.headers.get('x-robots-tag'), null, p);
    assert.ok(html.includes(`<link rel="canonical" href="${ORIGIN}${p}" />`), p);
    assert.doesNotMatch(html, /ld\+json/, p);
    titles.add(html.match(/<title>(.*?)<\/title>/)[1]);
  }
  assert.equal(titles.size, 4);
});

test('game pages keep zoom locked and use the dark theme color', async () => {
  const html = await (await get('/play')).text();
  assert.match(html, /user-scalable=no/);
  assert.match(html, /<meta name="theme-color" content="#1a1a1a"/);
});

test('private pages are noindex with no canonical', async () => {
  for (const p of ['/profile', '/u/abc_123', '/scores/abc123', '/scores/join/abc123', '/room/ABCD', '/admin']) {
    const res = await get(p);
    const html = await res.text();
    assert.equal(res.status, 200, p);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex', p);
    assert.match(html, /<meta name="robots" content="noindex" \/>/, p);
    assert.doesNotMatch(html, /rel="canonical"/, p);
  }
  assert.equal((await get('/scores')).headers.get('x-robots-tag'), null);
});

test('room invite links get a preview that names the room', async () => {
  const html = await (await get('/room/abcd')).text();
  assert.match(html, /<title>Join room ABCD \| Tiến Lên<\/title>/);
  assert.match(html, /<meta property="og:url" content="https:\/\/tienlen\.example\/room\/abcd" \/>/);
});

test('unknown pages return 404 with noindex', async () => {
  for (const p of ['/nope', '/scoresxyz', '/room/TOOLONG', '/u/bad.name']) {
    const res = await get(p);
    assert.equal(res.status, 404, p);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex', p);
  }
  const html = await (await get('/nope')).text();
  assert.match(html, /<title>Page not found \| Tiến Lên<\/title>/);
});

test('missing files return 404 instead of the app shell', async () => {
  const res = await get('/assets/index-old.js');
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(await res.text(), 'Not found');
});

test('trailing slashes and duplicate slashes redirect with a 301', async () => {
  const cases = [
    ['/privacy/', '/privacy'],
    ['/privacy/?ref=x', '/privacy?ref=x'],
    ['/scores//', '/scores'],
    ['//evil.example/', '/evil.example'],
    ['/index.html', '/'],
  ];
  for (const [from, to] of cases) {
    const res = await get(from);
    assert.equal(res.status, 301, from);
    assert.equal(res.headers.get('location'), to, from);
  }
});

test('hashed assets cache for a year and the service worker never caches', async () => {
  const asset = await get('/assets/index-abc.js');
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  const sw = await get('/sw.js');
  assert.equal(sw.status, 200);
  assert.equal(sw.headers.get('cache-control'), 'no-cache');
});

test('robots.txt and sitemap.xml use the configured origin', async () => {
  const robots = await get('/robots.txt');
  const robotsText = await robots.text();
  assert.match(robots.headers.get('content-type'), /text\/plain/);
  assert.match(robotsText, /^User-agent: \*$/m);
  assert.match(robotsText, /^Disallow: \/admin$/m);
  assert.doesNotMatch(robotsText, /Disallow: \/api/);
  assert.match(robotsText, /^Sitemap: https:\/\/tienlen\.example\/sitemap\.xml$/m);

  const sitemap = await get('/sitemap.xml');
  const xml = await sitemap.text();
  assert.match(sitemap.headers.get('content-type'), /application\/xml/);
  const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, ['/', '/play', '/scores', '/privacy', '/terms'].map((p) => ORIGIN + p));
});

test('a rebuilt index.html is picked up without a restart', async () => {
  const file = path.join(dist, 'index.html');
  await get('/');
  writeFileSync(file, TEMPLATE.replace('<body>', '<body data-build="2">'));
  const later = new Date(Date.now() + 5000);
  utimesSync(file, later, later);
  assert.match(await (await get('/')).text(), /data-build="2"/);
  writeFileSync(file, TEMPLATE);
});

test('api responses are noindex and pass through untouched', async () => {
  const res = await get('/api/thing');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex');
  assert.deepEqual(await res.json(), { ok: true });
});
