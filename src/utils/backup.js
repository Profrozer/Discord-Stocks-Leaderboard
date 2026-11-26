// Automatic backups: a copy of the database every 2 days in data/backups/ (newest 10 kept),
// plus a readable spending-export.json. If shop.db is ever lost or damaged, the bot restores
// the newest backup by itself on the next start (see database.js).
const fs = require('fs');
const path = require('path');
const db = require('../database');
const { saveUptime } = require('./uptime');

const EVERY_MS = (Number(process.env.BACKUP_EVERY_HOURS) || 48) * 60 * 60 * 1000;
const CHECK_MS = 60 * 60 * 1000; // check hourly, so restarts never skip a backup
const KEEP = 10;

function listBackups() {
  try {
    return fs
      .readdirSync(db.backupDir)
      .filter((f) => /^shop-.*\.db$/.test(f))
      .map((f) => ({ f, t: fs.statSync(path.join(db.backupDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
  } catch {
    return [];
  }
}

async function runBackup() {
  fs.mkdirSync(db.backupDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
  const file = path.join(db.backupDir, `shop-${stamp}.db`);

  saveUptime(); // so the saved active time is current
  await db.backupTo(file);
  fs.writeFileSync(path.join(db.backupDir, 'spending-export.json'), JSON.stringify(db.exportAll(), null, 2));

  // Keep only the newest KEEP backups
  for (const old of listBackups().slice(KEEP)) fs.rmSync(path.join(db.backupDir, old.f), { force: true });
  console.log(`[backup] Saved ${path.basename(file)} (keeping the newest ${KEEP})`);
}

async function checkBackup() {
  const newest = listBackups()[0];
  if (!newest || Date.now() - newest.t >= EVERY_MS) {
    await runBackup().catch((err) => console.warn('[backup] Failed:', err.message));
  }
}

function startBackups() {
  checkBackup();
  setInterval(checkBackup, CHECK_MS);
}

module.exports = { startBackups, runBackup };
