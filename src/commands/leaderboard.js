// /leaderboard — paginated embed; button clicks are handled in index.js
const { SlashCommandBuilder } = require('discord.js');
const { buildLeaderboard } = require('../utils/leaderboardView');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the shop spending leaderboard')
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply(); // user fetching can take a moment
    await interaction.editReply(await buildLeaderboard(interaction.client, 0, interaction.guild));
  },
};
