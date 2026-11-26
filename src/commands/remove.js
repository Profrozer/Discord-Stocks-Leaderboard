// /remove @user <amount>  — Administrators or staff role
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../database');
const { canManage } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription("Remove RM from a user's total spending (staff only)")
    .setDefaultMemberPermissions(null)
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('The customer').setRequired(true))
    .addNumberOption((o) =>
      o.setName('amount').setDescription('Amount in RM to take off, e.g. 50.00').setRequired(true).setMinValue(0.01).setMaxValue(10000000)
    ),

  async execute(interaction) {
    if (!canManage(interaction)) {
      return interaction.reply({ content: 'Staff only.', flags: MessageFlags.Ephemeral });
    }

    const user = interaction.options.getUser('user', true);
    const cents = Math.round(interaction.options.getNumber('amount', true) * 100);

    const result = db.removeSpending(user.id, cents);
    if (!result) {
      return interaction.reply({ content: `${user} has no spending recorded.`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    // If they asked for more than the user had, the total just floors at RM 0.00
    const note =
      result.removed < cents
        ? ` (their total was lower than ${db.formatRM(cents)}, so it was set to RM 0.00 and they were removed from the leaderboard)`
        : '';

    await interaction.reply({
      content: `Removed **${db.formatRM(result.removed)}** from ${user}. New total: **${db.formatRM(result.newTotal)}**${note}`,
      allowedMentions: { parse: [] },
    });
  },
};
