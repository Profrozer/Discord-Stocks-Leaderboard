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
        const description = `${PREFIX()} 24/7 ${up}`;
        await client.application.edit({ description });
    } catch (err) {
        console.warn('[bio] Could not update About Me:', err.message);
    } finally {
        running = false;
    }
}

async function setOfflineBio(client) {
    try {
        await client.application.edit({ description: `${PREFIX()} Currently offline.`.slice(0, 400) });
    } catch {}
}

function startBio(client) {
    updateBio(client);
    setInterval(() => updateBio(client), INTERVAL_MS);
}

module.exports = { startBio, setOfflineBio };