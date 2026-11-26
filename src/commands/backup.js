// /backup — post a backup file to the backup channel right now (staff)
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { canManage } = require('../utils/permissions');
const { sendBackup } = require('../utils/discordBackup');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Post a data backup to the backup channel now (staff only)')
    .setDefaultMemberPermissions(null)
    .setDMPermission(false),

  async execute(interaction) {
    if (!canManage(interaction)) {
      return interaction.reply({ content: 'Staff only.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const r = await sendBackup(interaction.client);
      await interaction.editReply(
        r.skipped
          ? 'Nothing to back up yet (the leaderboard is empty).'
          : `Backup posted to <#${process.env.BACKUP_CHANNEL_ID}> (${r.users} users).`
      );
    } catch (err) {
      await interaction.editReply(
        `Could not post the backup: ${err.message}\nCheck BACKUP_CHANNEL_ID, and that the bot can View Channel, Send Messages and Attach Files there.`
      );
    }
  },
};
