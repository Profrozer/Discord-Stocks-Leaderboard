// /add @user <amount>  — Administrators or staff role
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../database');
const { canManage } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add')
    .setDescription("Add RM to a user's total spending (staff only)")
    .setDefaultMemberPermissions(null) // visible to all; access is enforced in execute()
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('The customer').setRequired(true))
    .addNumberOption((o) =>
      o.setName('amount').setDescription('Amount in RM, e.g. 200.50').setRequired(true).setMinValue(0.01).setMaxValue(10000000)
    ),

  async execute(interaction) {
    if (!canManage(interaction)) {
      return interaction.reply({ content: 'Staff only.', flags: MessageFlags.Ephemeral });
    }

    const user = interaction.options.getUser('user', true);
    if (user.bot) {
      return interaction.reply({ content: "You can't add spending for a bot.", flags: MessageFlags.Ephemeral });
    }

    const cents = Math.round(interaction.options.getNumber('amount', true) * 100);
    const newTotal = db.addSpending(user.id, cents);

    await interaction.reply({
      content: `Added **${db.formatRM(cents)}** to ${user}. New total: **${db.formatRM(newTotal)}**`,
      allowedMentions: { parse: [] },
    });
  },
};
