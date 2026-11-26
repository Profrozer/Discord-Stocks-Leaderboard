// Counts the bot's total ACTIVE time across restarts. The total is saved in the database every
// minute (and on a clean stop), so after a restart it carries on from where it left off.
// Time while the bot was switched off is not counted. A crash can lose at most ~1 minute.
const db = require('../database');

let baseMs = 0;
let sessionStart = Date.now();

function getActiveMs() {
  return baseMs + (Date.now() - sessionStart);
}

function getFirstStart() {
  return Number(db.getMeta('first_start')) || sessionStart;
}

function saveUptime() {
  try {
    db.setMeta('active_ms', Math.round(getActiveMs()));
  } catch {
    /* ignore */
  }
}

function startUptime() {
  baseMs = Number(db.getMeta('active_ms')) || 0;
  sessionStart = Date.now();
  if (!db.getMeta('first_start')) db.setMeta('first_start', sessionStart);
  setInterval(saveUptime, 60 * 1000);
}

// Re-read the saved total (used after a backup is restored)
function reloadUptime() {
  baseMs = Number(db.getMeta('active_ms')) || 0;
  sessionStart = Date.now();
}

module.exports = { startUptime, getActiveMs, getFirstStart, saveUptime, reloadUptime };
