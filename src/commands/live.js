const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../database');
const { canManage } = require('../utils/permissions');
const { buildLeaderboard } = require('../utils/leaderboardView');
const { tick } = require('../utils/liveUpdater');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('live')
    .setDescription('Auto-updating leaderboard in this channel (staff only)')
    .setDefaultMemberPermissions(null)
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('start').setDescription('Post a leaderboard here that updates every minute'))
    .addSubcommand((s) => s.setName('stop').setDescription('Stop and delete the live leaderboard in this channel')),

  async execute(interaction) {
    if (!canManage(interaction)) {
      return interaction.reply({ content: 'Staff only.', flags: MessageFlags.Ephemeral });
    }

    const existing = db.getLiveBoardsInChannel(interaction.channelId);

    if (interaction.options.getSubcommand() === 'stop') {
      if (!existing.length) {
        return interaction.reply({ content: 'There is no live leaderboard in this channel.', flags: MessageFlags.Ephemeral });
      }
      for (const b of existing) {
        db.removeLiveBoard(b.message_id);
        await interaction.channel.messages.delete(b.message_id).catch(() => {});
      }
      return interaction.reply({ content: 'Live leaderboard stopped and removed.', flags: MessageFlags.Ephemeral });
    }

    if (existing.length) {
      return interaction.reply({
        content: 'This channel already has a live leaderboard. Use `/live stop` first if you want to move it.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const message = await interaction.channel.send(await buildLeaderboard(interaction.client, 0, interaction.guild));
      db.addLiveBoard(message.id, interaction.channelId, interaction.guildId);
      await interaction.editReply('Live leaderboard posted. It updates within a minute of any change.');
      tick(interaction.client).catch(() => {});
    } catch (err) {
      console.error(err);
      await interaction.editReply(
        "I couldn't post here. Make sure the bot can View Channel, Send Messages and Attach Files in this channel."
      );
    }
  },
};
