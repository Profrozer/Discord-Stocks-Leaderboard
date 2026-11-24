require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, MessageFlags, Routes, Events, version } = require('discord.js');
const db = require('./database');
const { buildLeaderboard } = require('./utils/leaderboardView');
const { loadEmojis } = require('./utils/emojis');
const { startLiveUpdater } = require('./utils/liveUpdater');
const { startPresence } = require('./utils/presence');
const { startBio, setOfflineBio } = require('./utils/bio');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.commands = new Collection();
for (const file of fs.readdirSync(path.join(__dirname, 'commands')).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(__dirname, 'commands', file));
  client.commands.set(command.data.name, command);
}

async function registerCommands() {
  const body = [...client.commands.values()].map((c) => c.data.toJSON());
  const { GUILD_ID } = process.env;
  const route = GUILD_ID
    ? Routes.applicationGuildCommands(client.application.id, GUILD_ID)
    : Routes.applicationCommands(client.application.id);
  await client.rest.put(route, { body });
  console.log(`[commands] Registered: ${body.map((c) => '/' + c.name).join(', ')} ${GUILD_ID ? '(guild)' : '(global, can take up to 1h)'}`);
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag} (discord.js v${version})`);
  await registerCommands().catch((err) => console.error('[commands] Registration failed:', err.message));
  await loadEmojis(client);
  startBio(client);
  startPresence(client);
  startLiveUpdater(client);
  console.log('Bot is ready.');
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const mentionOnly = new RegExp(`^<@!?${client.user.id}>$`);
  if (!mentionOnly.test(message.content.trim())) return;

  try {
    await message.channel.sendTyping();
    const view = await buildLeaderboard(client, 0, message.guild);
    await message.reply(view);
  } catch (err) {
    console.error(err);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) await command.execute(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('lb_')) {
      const [action, pageStr] = interaction.customId.split(':');
      const page = parseInt(pageStr, 10) || 0;
      const guild = interaction.guild;

      if (action === 'lb_prev') {
        await interaction.deferUpdate();
        return interaction.editReply(await buildLeaderboard(client, page - 1, guild));
      }
      if (action === 'lb_next') {
        await interaction.deferUpdate();
        return interaction.editReply(await buildLeaderboard(client, page + 1, guild));
      }
      if (action === 'lb_refresh') {
        await interaction.deferUpdate();
        return interaction.editReply(await buildLeaderboard(client, page, guild));
      }
      if (action === 'lb_me') {
        const total = db.getUserTotal(interaction.user.id);
        const content =
          total === null
            ? "You're not on the leaderboard yet."
            : `Your rank: **#${db.getUserRank(interaction.user.id)}** of ${db.countUsers()}\nTotal spent: **${db.formatRM(total)}**`;
        return interaction.reply({ content, flags: MessageFlags.Ephemeral });
      }
    }
  } catch (err) {
    console.error(err);
    const msg = { content: 'Something went wrong.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) interaction.followUp(msg).catch(() => { });
    else interaction.reply(msg).catch(() => { });
  }
});

async function shutdown() {
  await Promise.race([setOfflineBio(client), new Promise((r) => setTimeout(r, 3000))]);
  client.destroy();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

client.login(process.env.DISCORD_TOKEN);