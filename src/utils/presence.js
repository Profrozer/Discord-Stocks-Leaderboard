const { ActivityType } = require('discord.js');

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
    const up = Date.now() - (client.readyTimestamp ?? Date.now());
    client.user.setPresence({
        status: 'idle',
        activities: [{ type: ActivityType.Custom, name: 'Custom Status', state: `🟢Alive for ${formatUptime(up)}` }],
    });
}

function startPresence(client) {
    updatePresence(client);
    setInterval(() => updatePresence(client), INTERVAL_MS);
}

module.exports = { startPresence, formatUptime };