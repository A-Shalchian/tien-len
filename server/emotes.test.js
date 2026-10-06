import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmoteStore } from './emotes.js';
import { CORE_EMOTE_IDS } from '../client/src/utils/emotes.js';

function fakeDb(rows = []) {
  const table = new Map(rows.map((r) => [r.id, r.status]));
  return {
    table,
    async query(sql, params) {
      if (sql.startsWith('select')) return { rows: [...table].map(([id, status]) => ({ id, status })) };
      if (sql.startsWith('delete')) table.delete(params[0]);
      if (sql.startsWith('insert')) table.set(params[0], params[1]);
      return { rows: [] };
    },
  };
}

test('core emotes start approved and new candidates start pending', async () => {
  const store = createEmoteStore(fakeDb());
  await store.load();
  assert.deepEqual(store.enabledIds(), CORE_EMOTE_IDS);
  assert.equal(store.list().find((e) => e.id === 'tw-67').status, 'pending');
  assert.equal(store.isEnabled('tw-67'), false);
});

test('approving and rejecting change what players can send', async () => {
  const db = fakeDb([{ id: 'tw-scuba', status: 'approved' }, { id: 'ghost', status: 'approved' }]);
  const store = createEmoteStore(db);
  await store.load();
  assert.equal(store.isEnabled('tw-scuba'), true);
  assert.equal(store.isEnabled('ghost'), false);

  assert.equal(await store.setStatus('gg', 'rejected', 'admin'), true);
  assert.equal(store.isEnabled('gg'), false);
  assert.equal(db.table.get('gg'), 'rejected');

  assert.equal(await store.setStatus('gg', 'approved', 'admin'), true);
  assert.equal(store.isEnabled('gg'), true);
  assert.equal(db.table.has('gg'), false);

  assert.equal(await store.setStatus('nope', 'approved', 'admin'), false);
  assert.equal(await store.setStatus('tw-67', 'maybe', 'admin'), false);
});
