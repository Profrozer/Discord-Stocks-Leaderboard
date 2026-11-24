const { SlashCommandBuilder } = require('discord.js');
const { buildLeaderboard } = require('../utils/leaderboardView');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the shop spending leaderboard')
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply();
    await interaction.editReply(await buildLeaderboard(interaction.client, 0, interaction.guild));
  },
};
