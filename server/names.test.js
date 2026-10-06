import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicName, cleanName, cleanImage } from './names.js';

test('public names show first name and last initial unless a display name is set', () => {
  assert.equal(publicName(null, 'Mathew Drew'), 'Mathew D.');
  assert.equal(publicName(null, 'Nguyễn Văn Đức'), 'Nguyễn Đ.');
  assert.equal(publicName(null, 'Cher'), 'Cher');
  assert.equal(publicName('Ace', 'Mathew Drew'), 'Ace');
  assert.equal(publicName('  ', 'Linh Trần'), 'Linh T.');
  assert.equal(publicName(null, null), 'Player');
});

test('names are capped and avatars only come from Google', () => {
  assert.equal(cleanName('x'.repeat(100)).length, 40);
  assert.equal(cleanImage('https://lh3.googleusercontent.com/a/abc'), 'https://lh3.googleusercontent.com/a/abc');
  assert.equal(cleanImage('https://evil.example/track.png'), null);
});
