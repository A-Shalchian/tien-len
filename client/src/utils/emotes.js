export const EMOTES = [
  { id: 'chat', label: 'Chop', anim: true },
  { id: 'thoi', label: 'Stuck with a 2', anim: true },
  { id: 'toitrang', label: 'Instant win', anim: true },
  { id: 'cong', label: 'Frozen out', anim: true },
  { id: 'gg', label: 'GG', anim: false },
  { id: 'ez', label: 'EZ', anim: true },
  { id: 'icant', label: 'Crying laughing', anim: true },
  { id: 'clown', label: 'Clown', anim: false },
  { id: 'sweat', label: 'Nervous', anim: true },
  { id: 'flip', label: 'Table flip', anim: true },
  { id: 'sleep', label: 'Sleepy', anim: true },
  { id: 'stonks', label: 'Stonks', anim: false },
];

export const EMOTE_IDS = EMOTES.map((e) => e.id);

export function emoteImage(id, animated = true) {
  const emote = EMOTES.find((e) => e.id === id);
  if (!emote) return null;
  return emote.anim && animated ? `/emotes/${id}.gif` : `/emotes/${id}.png`;
}
