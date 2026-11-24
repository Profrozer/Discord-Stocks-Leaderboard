// Keeps the bot's "About Me" (its Developer Portal description) up to date with its uptime,
// e.g. "Shop leaderboard bot. Running for 3h 12m (since 24 Nov, 10:04 am)".
// Updated every 5 minutes to stay well clear of Discord rate limits.
const { formatUptime } = require('./presence');

const INTERVAL_MS = 5 * 60 * 1000;
const PREFIX = () => process.env.BIO_TEXT || 'Leaderboard Ranking';

function since(client) {
    return new Date(client.readyTimestamp).toLocaleString('en-MY', {
        timeZone: process.env.TIMEZONE || 'Asia/Kuala_Lumpur',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

let running = false;

async function updateBio(client) {
    if (running) return;
    running = true;
    try {
        const up = formatUptime(Date.now() - client.readyTimestamp);
        // Discord limits the description to 400 characters
        const description = `${PREFIX()} 24/7 ${up}`;
        await client.application.edit({ description });
    } catch (err) {
        console.warn('[bio] Could not update About Me:', err.message);
    } finally {
        running = false;
    }
}

// Called on Ctrl+C / pm2 stop so the bio doesn't keep claiming "Running for ..." while offline
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