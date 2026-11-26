// Shows the bot as Online (green dot) with a status under its name, like "Active for 52h 14m" (total, kept across restarts).
// Discord only allows ~5 presence updates per 20s, so it refreshes once a minute (no live seconds).
const { ActivityType } = require('discord.js');
const { getActiveMs } = require('./uptime');

const INTERVAL_MS = 60 * 1000;

function formatUptime(ms) {
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function updatePresence(client) {
  const up = getActiveMs();
  client.user.setPresence({
    status: 'online', // the green round dot
    activities: [{ type: ActivityType.Custom, name: 'Custom Status', state: `Active for ${formatUptime(up)}` }],
  });
}

function startPresence(client) {
  updatePresence(client);
  setInterval(() => updatePresence(client), INTERVAL_MS);
}

module.exports = { startPresence, formatUptime };
