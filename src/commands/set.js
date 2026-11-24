// /set @user <amount>  — Administrators or staff role. Sets the total to an exact amount.
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../database');
const { canManage } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set')
    .setDescription("Set a user's total spending to an exact amount (staff only)")
    .setDefaultMemberPermissions(null) // visible to all; access is enforced in execute()
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('The customer').setRequired(true))
    .addNumberOption((o) =>
      o.setName('amount').setDescription('New total in RM, e.g. 350.00 (0 removes them)').setRequired(true).setMinValue(0).setMaxValue(10000000)
    ),

  async execute(interaction) {
    if (!canManage(interaction)) {
      return interaction.reply({ content: 'Staff only.', flags: MessageFlags.Ephemeral });
    }

    const user = interaction.options.getUser('user', true);
    if (user.bot) {
      return interaction.reply({ content: "You can't set spending for a bot.", flags: MessageFlags.Ephemeral });
    }

    const cents = Math.round(interaction.options.getNumber('amount', true) * 100);
    const { previous, newTotal } = db.setSpending(user.id, cents);

    const tail = newTotal === 0 ? ' They were removed from the leaderboard.' : '';
    await interaction.reply({
      content: `Set ${user} to **${db.formatRM(newTotal)}** (was ${db.formatRM(previous)}).${tail}`,
      allowedMentions: { parse: [] },
    });
  },
};
