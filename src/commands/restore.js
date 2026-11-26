// /restore file:<backup .json>  — Administrators only. Replaces ALL data with the backup.
const path = require('path');
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../database');
const { parseBackup, downloadText } = require('../utils/discordBackup');
const { reloadUptime } = require('../utils/uptime');
const { formatUptime } = require('../utils/presence');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restore')
    .setDescription('Restore all data from a backup file (Administrators only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addAttachmentOption((o) => o.setName('file').setDescription('The shop-backup-....json file').setRequired(true)),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Administrators only.', flags: MessageFlags.Ephemeral });
    }

    const file = interaction.options.getAttachment('file', true);
    if (!file.name?.toLowerCase().endsWith('.json')) {
      return interaction.reply({ content: 'Please attach the backup .json file.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const data = parseBackup(await downloadText(file.url));

      // Safety net: snapshot the current data first, so a wrong restore can be undone
      const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
      await db.backupTo(path.join(db.backupDir, `before-restore-${stamp}.db`));

      db.importAll(data);
      reloadUptime();

      await interaction.editReply(
        `Restored **${data.users.length}** users and active time **${formatUptime(data.meta.active_ms || 0)}** from \`${file.name}\`.\n` +
          'Your previous data was saved to `data/backups/before-restore-...db` on the server first.'
      );
    } catch (err) {
      console.error(err);
      await interaction.editReply(`Restore failed, nothing was changed: ${err.message}`);
    }
  },
};
