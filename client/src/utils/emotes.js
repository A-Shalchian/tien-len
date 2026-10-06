import CATALOG from './emote-catalog.js';

export const EMOTES = CATALOG;
export const EMOTE_IDS = CATALOG.map((e) => e.id);
export const CORE_EMOTE_IDS = CATALOG.filter((e) => e.set === 'core').map((e) => e.id);

const byId = new Map(CATALOG.map((e) => [e.id, e]));

export function findEmote(id) {
  return byId.get(id) || null;
}

export function emoteImage(id, animated = true) {
  const emote = byId.get(id);
  if (!emote) return null;
  return emote.anim && animated ? `/emotes/${id}.gif` : `/emotes/${id}.png`;
}
