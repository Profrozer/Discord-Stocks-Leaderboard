// Builds the leaderboard message: rendered PNG image + button rows for a given page.
const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { loadImage } = require('@napi-rs/canvas');
const db = require('../database');
const { renderLeaderboard } = require('./leaderboardImage');
const { emoji } = require('./emojis');

const PER_PAGE = 10;

// Small avatar cache so paging/refreshing doesn't re-download images every click
const avatarCache = new Map(); // url -> { img, at }
const AVATAR_TTL = 15 * 60 * 1000;

async function getAvatar(url) {
  if (!url) return null;
  const hit = avatarCache.get(url);
  if (hit && Date.now() - hit.at < AVATAR_TTL) return hit.img;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const img = await loadImage(Buffer.from(await res.arrayBuffer()));
    if (avatarCache.size > 500) avatarCache.clear();
    avatarCache.set(url, { img, at: Date.now() });
    return img;
  } catch {
    return null; // falls back to a letter avatar
  }
}

// Server nickname + server avatar if they're still in the guild, otherwise global profile
async function getPerson(client, guild, userId) {
  const opts = { extension: 'png', size: 128, forceStatic: true };
  const member = guild ? guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null)) : null;
  if (member) return { name: member.displayName, avatarUrl: member.displayAvatarURL(opts) };

  const user = await client.users.fetch(userId).catch(() => null);
  if (user) return { name: user.globalName ?? user.username, avatarUrl: user.displayAvatarURL(opts) };

  return { name: 'Unknown user', avatarUrl: null };
}

async function buildLeaderboard(client, requestedPage = 0, guild = null) {
  const total = db.countUsers();
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  // Clamp so Refresh / stale buttons never point past the last page
  const page = Math.min(Math.max(requestedPage, 0), totalPages - 1);

  const rows = db.getPage(page, PER_PAGE);

  const entries = await Promise.all(
    rows.map(async (row, i) => {
      const person = await getPerson(client, guild, row.user_id);
      return {
        rank: page * PER_PAGE + i + 1,
        name: person.name,
        cents: row.total_cents,
        avatar: await getAvatar(person.avatarUrl),
      };
    })
  );

  const png = renderLeaderboard({
    entries,
    page,
    totalPages,
    maxCents: db.getTopTotal(),
    shopName: process.env.SHOP_NAME || 'SHOP',
  });
  const file = new AttachmentBuilder(png, { name: 'leaderboard.png', description: 'Spending leaderboard' });

  // Plain grey buttons (Discord has no white button color; Secondary is the neutral one).
  // Icons are your uploaded white emojis; if they're missing, the button falls back to text.
  const button = (id, name, label, fallbackLabel) => {
    const b = new ButtonBuilder().setCustomId(id).setStyle(ButtonStyle.Secondary);
    const e = emoji(name);
    if (e) b.setEmoji(e);
    if (label) b.setLabel(label);
    else if (!e) b.setLabel(fallbackLabel);
    return b;
  };

  // Row 1: <  [page indicator]  >
  const navRow = new ActionRowBuilder().addComponents(
    button(`lb_prev:${page}`, 'lb_prev', null, 'Prev').setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('lb_indicator')
      .setLabel(`${page + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    button(`lb_next:${page}`, 'lb_next', null, 'Next').setDisabled(page >= totalPages - 1)
  );

  // Row 2: My Rank + Refresh
  const actionRow = new ActionRowBuilder().addComponents(
    button('lb_me', 'lb_rank', 'My Rank'),
    button(`lb_refresh:${page}`, 'lb_refresh', 'Refresh')
  );

  return {
    content: '',
    embeds: [], // clears any old embed when editing a message
    files: [file],
    attachments: [], // replaces the previous image instead of stacking a new one
    components: [navRow, actionRow],
    allowedMentions: { parse: [] },
  };
}

module.exports = { buildLeaderboard, PER_PAGE };
