// SQLite layer. Money is stored as integer cents to avoid floating-point errors
// (e.g. 0.1 + 0.2 !== 0.3), then converted to RM only for display.
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbFile = path.join(dataDir, 'shop.db');
const backupDir = path.join(dataDir, 'backups');

function latestBackupFile() {
  try {
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => /^shop-.*\.db$/.test(f))
      .map((f) => ({ f, t: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    return files.length ? path.join(backupDir, files[0].f) : null;
  } catch {
    return null;
  }
}

// If shop.db is missing, empty or corrupt, restore the newest backup before opening it.
function openOrRestore() {
  let needRestore = !fs.existsSync(dbFile) || fs.statSync(dbFile).size === 0;
  if (!needRestore) {
    try {
      const probe = new Database(dbFile);
      const ok = probe.pragma('quick_check', { simple: true }) === 'ok';
      probe.close();
      needRestore = !ok;
    } catch {
      needRestore = true;
    }
  }

  if (needRestore) {
    const backup = latestBackupFile();
    if (backup) {
      if (fs.existsSync(dbFile) && fs.statSync(dbFile).size > 0) {
        fs.renameSync(dbFile, `${dbFile}.corrupt-${Date.now()}`); // keep the bad file, just in case
      }
      for (const ext of ['-wal', '-shm']) fs.rmSync(dbFile + ext, { force: true });
      fs.copyFileSync(backup, dbFile);
      console.log(`[db] shop.db was missing or damaged. Restored from backup: ${path.basename(backup)}`);
    }
  }
  return new Database(dbFile);
}

const db = openOrRestore();
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

db.exec(`
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

// Bumped on every spending change so the live updater knows when a refresh is needed
let dataVersion = 0;

const stmts = {
  // Insert user or add to their existing total in one atomic statement
  add: db.prepare(`
    INSERT INTO spending (user_id, total_cents) VALUES (@id, @cents)
    ON CONFLICT(user_id) DO UPDATE SET total_cents = total_cents + excluded.total_cents
  `),
  get: db.prepare('SELECT total_cents FROM spending WHERE user_id = ?'),
  del: db.prepare('DELETE FROM spending WHERE user_id = ?'),
  metaGet: db.prepare('SELECT value FROM meta WHERE key = ?'),
  metaSet: db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
  allSpending: db.prepare('SELECT user_id, total_cents FROM spending ORDER BY total_cents DESC, user_id ASC'),
  allMeta: db.prepare('SELECT key, value FROM meta'),
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
  // Rank = number of users strictly ahead (same tie-break as the list) + 1
  rank: db.prepare(`
    SELECT COUNT(*) + 1 AS rank FROM spending
    WHERE total_cents > @cents OR (total_cents = @cents AND user_id < @id)
  `),
};

/** Add RM (as cents) to a user; returns their new total in cents. */
function addSpending(userId, cents) {
  stmts.add.run({ id: userId, cents });
  dataVersion++;
  return stmts.get.get(userId).total_cents;
}

/**
 * Subtract RM (as cents) from a user. Never goes below 0; a user who hits 0 is removed
 * from the leaderboard. Returns null if the user has no record, otherwise
 * { removed, newTotal } (both in cents) — `removed` is what was actually taken off.
 */
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

/**
 * Set a user's total to an exact amount (cents). Setting 0 removes them from the leaderboard.
 * Returns { previous, newTotal } in cents (previous is 0 if they had no record).
 */
const setSpending = db.transaction((userId, cents) => {
  const row = stmts.get.get(userId);
  dataVersion++;
  const previous = row ? row.total_cents : 0;
  if (cents === 0) stmts.del.run(userId);
  else stmts.upsert.run({ id: userId, cents });
  return { previous, newTotal: cents };
});

// ---- Small key/value store (uptime counter etc.) ----
function getMeta(key) {
  const row = stmts.metaGet.get(key);
  return row ? row.value : null;
}
function setMeta(key, value) {
  stmts.metaSet.run(key, String(value));
}

// ---- Backups ----
/** Safe online copy of the whole database (works while the bot is running). */
function backupTo(file) {
  return db.backup(file);
}
/** Everything as plain data (this is the backup file format). */
function exportAll() {
  return {
    format: 'shop-leaderboard-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    users: stmts.allSpending
      .all()
      .map((r) => ({ user_id: r.user_id, total_cents: r.total_cents, total_rm: r.total_cents / 100 })),
    liveBoards: stmts.liveAll.all(),
    meta: Object.fromEntries(stmts.allMeta.all().map((r) => [r.key, r.value])),
  };
}

/** Replace ALL data with a (validated) backup, in one transaction: either everything or nothing. */
const importAll = db.transaction((data) => {
  db.prepare('DELETE FROM spending').run();
  db.prepare('DELETE FROM live_boards').run();
  db.prepare('DELETE FROM meta').run();
  for (const u of data.users) stmts.upsert.run({ id: u.user_id, cents: u.total_cents });
  for (const b of data.liveBoards) stmts.liveAdd.run(b.message_id, b.channel_id, b.guild_id);
  for (const [k, v] of Object.entries(data.meta)) stmts.metaSet.run(k, String(v));
  dataVersion++;
});

function getDataVersion() {
  return dataVersion;
}

// ---- Live (auto-updating) leaderboard messages ----
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

/** Highest total in cents (0 if empty) — used to scale the progress bars. */
function getTopTotal() {
  return stmts.top.get().m;
}

function getPage(page, perPage) {
  return stmts.page.all(perPage, page * perPage);
}

/** 22260 -> "RM 222.60" */
function formatRM(cents) {
  const rm = (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `RM ${rm}`;
}

module.exports = {
  getMeta, setMeta, backupTo, exportAll, importAll, backupDir,
  getDataVersion, addLiveBoard, removeLiveBoard, getLiveBoards, getLiveBoardsInChannel,
  addSpending, removeSpending, setSpending, getUserTotal, getUserRank, countUsers, getTopTotal, getPage, formatRM };
