import common from './vi/common.js';
import landing from './vi/landing.js';
import legal from './vi/legal.js';
import tracker from './vi/tracker.js';
import profile from './vi/profile.js';
import game from './vi/game.js';
import server, { patterns } from './vi/server.js';

export const viPatterns = patterns;

export default {
  ...server,
  ...landing,
  ...legal,
  ...tracker,
  ...profile,
  ...game,
  ...common,
};
