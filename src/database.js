const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'shop.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS spending (
    user_id     TEXT PRIMARY KEY,
    total_cents INTEGER NOT NULL DEFAULT 0
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS live_boards (
    message_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    guild_id   TEXT NOT NULL
  )
`);

let dataVersion = 0;

const stmts = {
  add: db.prepare(`
    INSERT INTO spending (user_id, total_cents) VALUES (@id, @cents)
    ON CONFLICT(user_id) DO UPDATE SET total_cents = total_cents + excluded.total_cents
  `),
  get: db.prepare('SELECT total_cents FROM spending WHERE user_id = ?'),
  del: db.prepare('DELETE FROM spending WHERE user_id = ?'),
  liveAdd: db.prepare('INSERT OR REPLACE INTO live_boards (message_id, channel_id, guild_id) VALUES (?, ?, ?)'),
  liveRemove: db.prepare('DELETE FROM live_boards WHERE message_id = ?'),
  liveAll: db.prepare('SELECT message_id, channel_id, guild_id FROM live_boards'),
  liveByChannel: db.prepare('SELECT message_id, channel_id, guild_id FROM live_boards WHERE channel_id = ?'),
  upsert: db.prepare(`
    INSERT INTO spending (user_id, total_cents) VALUES (@id, @cents)
    ON CONFLICT(user_id) DO UPDATE SET total_cents = excluded.total_cents
  `),
  set: db.prepare('UPDATE spending SET total_cents = ? WHERE user_id = ?'),
  count: db.prepare('SELECT COUNT(*) AS n FROM spending'),
  top: db.prepare('SELECT COALESCE(MAX(total_cents), 0) AS m FROM spending'),
  page: db.prepare(`
    SELECT user_id, total_cents FROM spending
    ORDER BY total_cents DESC, user_id ASC
    LIMIT ? OFFSET ?
  `),
  rank: db.prepare(`
    SELECT COUNT(*) + 1 AS rank FROM spending
    WHERE total_cents > @cents OR (total_cents = @cents AND user_id < @id)
  `),
};

function addSpending(userId, cents) {
  stmts.add.run({ id: userId, cents });
  dataVersion++;
  return stmts.get.get(userId).total_cents;
}

const removeSpending = db.transaction((userId, cents) => {
  const row = stmts.get.get(userId);
  if (!row) return null;
  dataVersion++;
  const removed = Math.min(cents, row.total_cents);
  const newTotal = row.total_cents - removed;
  if (newTotal === 0) stmts.del.run(userId);
  else stmts.set.run(newTotal, userId);
  return { removed, newTotal };
});

const setSpending = db.transaction((userId, cents) => {
  const row = stmts.get.get(userId);
  dataVersion++;
  const previous = row ? row.total_cents : 0;
  if (cents === 0) stmts.del.run(userId);
  else stmts.upsert.run({ id: userId, cents });
  return { previous, newTotal: cents };
});

function getDataVersion() {
  return dataVersion;
}

function addLiveBoard(messageId, channelId, guildId) {
  stmts.liveAdd.run(messageId, channelId, guildId);
}
function removeLiveBoard(messageId) {
  stmts.liveRemove.run(messageId);
}
function getLiveBoards() {
  return stmts.liveAll.all();
}
function getLiveBoardsInChannel(channelId) {
  return stmts.liveByChannel.all(channelId);
}

function getUserTotal(userId) {
  const row = stmts.get.get(userId);
  return row ? row.total_cents : null;
}

function getUserRank(userId) {
  const total = getUserTotal(userId);
  if (total === null) return null;
  return stmts.rank.get({ id: userId, cents: total }).rank;
}

function countUsers() {
  return stmts.count.get().n;
}

function getTopTotal() {
  return stmts.top.get().m;
}

function getPage(page, perPage) {
  return stmts.page.all(perPage, page * perPage);
}

function formatRM(cents) {
  const rm = (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `RM ${rm}`;
}

module.exports = {
  getDataVersion, addLiveBoard, removeLiveBoard, getLiveBoards, getLiveBoardsInChannel,
  addSpending, removeSpending, setSpending, getUserTotal, getUserRank, countUsers, getTopTotal, getPage, formatRM };
