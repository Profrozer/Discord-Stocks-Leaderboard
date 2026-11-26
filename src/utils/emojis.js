// Looks up your custom button icons (Application Emojis) by name.
// Upload them in Developer Portal -> your app -> Emojis, using EXACTLY these names:
//   lb_prev, lb_next, lb_rank, lb_refresh
// If one is missing, that button just shows text instead.
const WANTED = ['lb_prev', 'lb_next', 'lb_rank', 'lb_refresh'];
const cache = new Map(); // name -> id

async function loadEmojis(client) {
  cache.clear();

  if (!client.application?.emojis) {
    console.warn('[emojis] This discord.js version is too old for application emojis. Run: npm install discord.js@latest');
    return;
  }

  try {
    const list = await client.application.emojis.fetch();
    for (const e of list.values()) cache.set(e.name, e.id);

    const missing = WANTED.filter((n) => !cache.has(n));
    console.log(`[emojis] Found on this bot: ${[...cache.keys()].join(', ') || '(none)'}`);
    if (missing.length) {
      console.warn(`[emojis] Missing: ${missing.join(', ')} -> those buttons will show text. Upload them in Developer Portal -> Emojis, then restart the bot.`);
    } else {
      console.log('[emojis] All 4 button icons loaded.');
    }
  } catch (err) {
    console.warn('[emojis] Could not load application emojis:', err.message);
  }
}

function emoji(name) {
  const id = cache.get(name);
  return id ? { id, name } : undefined;
}

module.exports = { loadEmojis, emoji };
