// Backups to a Discord channel. Every 2 days (BACKUP_EVERY_HOURS) the bot posts a JSON backup file
// into BACKUP_CHANNEL_ID. To restore: use /restore with that file, or (on a brand-new empty
// database) the bot restores the newest backup from the channel by itself on startup.
const { AttachmentBuilder } = require('discord.js');
const db = require('../database');
const { saveUptime, reloadUptime } = require('./uptime');
const { formatUptime } = require('./presence');

const EVERY_MS = (Number(process.env.BACKUP_EVERY_HOURS) || 48) * 60 * 60 * 1000;
const KEEP_IN_CHANNEL = 10;
const FILE_RE = /^shop-backup-.*\.json$/;
const MAX_BYTES = 5 * 1024 * 1024;

const channelId = () => process.env.BACKUP_CHANNEL_ID || '';
const isId = (v) => typeof v === 'string' && /^\d{5,25}$/.test(v);

/** Read + validate a backup file's text. Throws a readable Error if anything is off. */
function parseBackup(text) {
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (d?.format !== 'shop-leaderboard-backup' || d.version !== 1) {
    throw new Error('That is not a leaderboard backup file.');
  }
  if (!Array.isArray(d.users)) throw new Error('Backup is missing the users list.');

  const users = d.users.map((u) => {
    if (!isId(u?.user_id) || !Number.isSafeInteger(u.total_cents) || u.total_cents < 0) {
      throw new Error('Backup contains an invalid user entry.');
    }
    return { user_id: u.user_id, total_cents: u.total_cents };
  });

  const liveBoards = (Array.isArray(d.liveBoards) ? d.liveBoards : []).filter(
    (b) => isId(b?.message_id) && isId(b?.channel_id) && isId(b?.guild_id)
  );

  // Only these two counters are restored from meta (active time + first start)
  const meta = {};
  for (const k of ['active_ms', 'first_start']) {
    const n = Number(d.meta?.[k]);
    if (Number.isFinite(n) && n >= 0) meta[k] = Math.round(n);
  }
  return { users, liveBoards, meta, exportedAt: d.exportedAt };
}

async function downloadText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download the file (HTTP ${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('Backup file is too large.');
  return buf.toString('utf8');
}

/** Post a backup file into the backup channel. Returns { skipped } or { sent }. */
async function sendBackup(client) {
  if (!channelId()) throw new Error('BACKUP_CHANNEL_ID is not set in .env.');

  saveUptime(); // make sure the saved active time is current
  const data = db.exportAll();
  if (!data.users.length) return { skipped: true }; // never post an empty backup as "latest"

  const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
  const name = `shop-backup-${stamp}.json`;
  const channel = await client.channels.fetch(channelId());
  await channel.send({
    content: `Leaderboard backup | ${data.users.length} users | active ${formatUptime(Number(data.meta.active_ms) || 0)}`,
    files: [new AttachmentBuilder(Buffer.from(JSON.stringify(data, null, 2)), { name })],
    allowedMentions: { parse: [] },
  });
  db.setMeta('last_discord_backup', Date.now());

  // Tidy up: delete this bot's older backup posts beyond the newest few
  try {
    const msgs = await channel.messages.fetch({ limit: 100 });
    const mine = [...msgs.values()].filter(
      (m) => m.author.id === client.user.id && m.attachments.some((a) => FILE_RE.test(a.name ?? ''))
    );
    for (const old of mine.slice(KEEP_IN_CHANNEL)) await old.delete().catch(() => {});
  } catch {
    /* tidy-up is optional */
  }
  return { sent: true, users: data.users.length };
}

/** On a brand-new empty database, pull the newest backup out of the channel automatically. */
async function autoRestoreFromChannel(client) {
  if (!channelId()) return;
  const fresh = db.countUsers() === 0 && !db.getMeta('first_start');
  if (!fresh) return;

  try {
    const channel = await client.channels.fetch(channelId());
    const msgs = await channel.messages.fetch({ limit: 100 });
    for (const m of msgs.values()) {
      if (m.author.id !== client.user.id) continue;
      const att = m.attachments.find((a) => FILE_RE.test(a.name ?? ''));
      if (!att) continue;
      const data = parseBackup(await downloadText(att.url));
      db.importAll(data);
      reloadUptime();
      console.log(`[backup] Fresh database: restored ${data.users.length} users from the Discord backup ${att.name}`);
      return;
    }
    console.log('[backup] Fresh database, but no backup found in the backup channel.');
  } catch (err) {
    console.warn('[backup] Could not auto-restore from the channel:', err.message);
  }
}

function startDiscordBackups(client) {
  if (!channelId()) {
    console.log('[backup] BACKUP_CHANNEL_ID not set: Discord backups are off.');
    return;
  }
  const check = async () => {
    const last = Number(db.getMeta('last_discord_backup')) || 0;
    if (Date.now() - last < EVERY_MS) return;
    try {
      const r = await sendBackup(client);
      if (r.sent) console.log(`[backup] Posted a backup to the Discord channel (${r.users} users)`);
    } catch (err) {
      console.warn('[backup] Could not post to the backup channel:', err.message);
    }
  };
  check();
  setInterval(check, 60 * 60 * 1000);
}

module.exports = { parseBackup, downloadText, sendBackup, autoRestoreFromChannel, startDiscordBackups };
