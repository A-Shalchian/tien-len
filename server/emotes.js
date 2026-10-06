import { EMOTES } from '../client/src/utils/emotes.js';

export const EMOTE_STATUSES = ['approved', 'rejected', 'pending'];

export function defaultStatus(emote) {
  return emote.set === 'core' ? 'approved' : 'pending';
}

export function createEmoteStore(db) {
  const known = new Map(EMOTES.map((e) => [e.id, e]));
  let saved = new Map();
  let enabled = new Set();

  const statusOf = (emote) => saved.get(emote.id) || defaultStatus(emote);
  const rebuild = () => {
    enabled = new Set(EMOTES.filter((e) => statusOf(e) === 'approved').map((e) => e.id));
  };
  rebuild();

  return {
    async load() {
      const { rows } = await db.query('select id, status from emote_reviews');
      saved = new Map(rows.filter((r) => known.has(r.id)).map((r) => [r.id, r.status]));
      rebuild();
    },
    isEnabled(id) {
      return enabled.has(id);
    },
    enabledIds() {
      return EMOTES.filter((e) => enabled.has(e.id)).map((e) => e.id);
    },
    list() {
      return EMOTES.map((e) => ({ id: e.id, set: e.set, status: statusOf(e) }));
    },
    async setStatus(id, status, adminId, client = db) {
      const emote = known.get(id);
      if (!emote || !EMOTE_STATUSES.includes(status)) return false;
      if (status === defaultStatus(emote)) {
        await client.query('delete from emote_reviews where id = $1', [id]);
        saved.delete(id);
      } else {
        await client.query(
          `insert into emote_reviews (id, status, updated_by) values ($1, $2, $3)
           on conflict (id) do update set status = $2, updated_by = $3, updated_at = now()`,
          [id, status, adminId],
        );
        saved.set(id, status);
      }
      rebuild();
      return true;
    },
  };
}
