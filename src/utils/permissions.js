const { PermissionFlagsBits } = require('discord.js');

function canManage(interaction) {
  const staffRoleId = process.env.STAFF_ROLE_ID;
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  const isStaff = staffRoleId && interaction.member.roles.cache.has(staffRoleId);
  return Boolean(isAdmin || isStaff);
}

module.exports = { canManage };
