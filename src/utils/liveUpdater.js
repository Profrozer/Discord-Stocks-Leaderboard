// Keeps "live" leaderboard messages fresh: every 60 seconds each live message is re-rendered
// and edited, so the "Updated" time in the footer moves and any spending changes show up.
const db = require('../database');
const { buildLeaderboard } = require('./leaderboardView');
const { collectGarbage } = require('./memory');

const INTERVAL_MS = 60 * 1000;

let running = false;

// Keep whatever page people are browsing: read it from the message's Refresh button id
function currentPage(message) {
  for (const row of message.components ?? []) {
    for (const c of row.components ?? []) {
      if (c.customId?.startsWith('lb_refresh:')) return parseInt(c.customId.split(':')[1], 10) || 0;
    }
  }
  return 0;
}

async function tick(client) {
  if (running) return; // never overlap runs
  running = true;
  try {
    for (const board of db.getLiveBoards()) {
      try {
        const channel = await client.channels.fetch(board.channel_id);
        const message = await channel.messages.fetch(board.message_id);
        const guild = client.guilds.cache.get(board.guild_id) ?? null;
        await message.edit(await buildLeaderboard(client, currentPage(message), guild));
        console.log(`[live] Updated board ${board.message_id} at ${new Date().toLocaleTimeString()}`);
      } catch (err) {
        // 10003 = channel deleted, 10008 = message deleted -> stop tracking it
        if (err.code === 10003 || err.code === 10008) {
          db.removeLiveBoard(board.message_id);
          console.log(`[live] Removed board ${board.message_id} (message or channel was deleted)`);
        } else {
          console.warn(`[live] Could not update ${board.message_id}: ${err.message}`);
        }
      }
    }
  } finally {
    running = false;
    collectGarbage(); // frees the image buffers from this round
  }
}

function startLiveUpdater(client) {
  tick(client).catch((e) => console.error('[live]', e));
  setInterval(() => tick(client).catch((e) => console.error('[live]', e)), INTERVAL_MS);
  console.log(`[live] Auto-update running (${db.getLiveBoards().length} live board(s), every 60s)`);
}

module.exports = { startLiveUpdater, tick };
