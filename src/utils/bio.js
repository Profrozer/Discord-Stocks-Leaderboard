// Keeps the bot's "About Me" (its Developer Portal description) up to date with its uptime,
// e.g. "Shop leaderboard bot. Active for 52h 14m (since 12 Nov 2026)" (total active time, kept across restarts).
// Updated every 5 minutes to stay well clear of Discord rate limits.
const { formatUptime } = require('./presence');
const { getActiveMs, getFirstStart } = require('./uptime');

const INTERVAL_MS = 5 * 60 * 1000;
const PREFIX = () => process.env.BIO_TEXT || 'Shop leaderboard bot.';

function since() {
  return new Date(getFirstStart()).toLocaleString('en-MY', {
    timeZone: process.env.TIMEZONE || 'Asia/Kuala_Lumpur',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

let running = false;

async function updateBio(client) {
  if (running) return;
  running = true;
  try {
    const up = formatUptime(getActiveMs());
    // Discord limits the description to 400 characters
    const description = `${PREFIX()} Active for ${up} (since ${since()})`.slice(0, 400);
    await client.application.edit({ description });
  } catch (err) {
    console.warn('[bio] Could not update About Me:', err.message);
  } finally {
    running = false;
  }
}

// Called on Ctrl+C / pm2 stop so the bio doesn't keep claiming "Active for ..." while offline
async function setOfflineBio(client) {
  try {
    await client.application.edit({ description: `${PREFIX()} Currently offline.`.slice(0, 400) });
  } catch {
    /* ignore */
  }
}

function startBio(client) {
  updateBio(client);
  setInterval(() => updateBio(client), INTERVAL_MS);
}

module.exports = { startBio, setOfflineBio };
