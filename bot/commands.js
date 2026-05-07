const { db } = require("./firebase");
const { scanGuild } = require("./scanner");
const admin = require("firebase-admin");

async function handleLink(interaction) {
  const code = interaction.options.getString("code").toUpperCase();
  const guildId = interaction.guildId;
  const guildName = interaction.guild.name;

  if (!interaction.memberPermissions.has("ManageGuild")) {
    return interaction.reply({ content: "❌ Only server admins can link FileWeb.", ephemeral: true });
  }

  const existing = await db.collection("discordServers").doc(guildId).get();
  if (existing.exists && existing.data().linked) {
    return interaction.reply({ content: "⚠️ This server is already linked. Use /unlink first.", ephemeral: true });
  }

  const codeDoc = await db.collection("linkCodes").doc(code).get();
  if (!codeDoc.exists) {
    return interaction.reply({ content: "❌ Invalid link code.", ephemeral: true });
  }

  const codeData = codeDoc.data();
  if (codeData.expiresAt && codeData.expiresAt.toDate() < new Date()) {
    await db.collection("linkCodes").doc(code).delete();
    return interaction.reply({ content: "❌ This code expired. Generate a new one.", ephemeral: true });
  }

  const userDoc = await db.collection("users").doc(codeData.userId).get();
  const defaultBoardId = userDoc.data()?.defaultBoardId;
  if (!defaultBoardId) {
    return interaction.reply({ content: "❌ User has no default board.", ephemeral: true });
  }

  const channels = interaction.guild.channels.cache.filter(ch => ch.isTextBased()).map(ch => ch.id);

  await db.collection("discordServers").doc(guildId).set({
    ownerId: codeData.userId,
    guildName,
    linked: true,
    linkedAt: admin.firestore.FieldValue.serverTimestamp(),
    selectedChannels: channels,
    defaultBoardId,
  });

  await db.collection("linkCodes").doc(code).delete();

  await interaction.reply({
    content: `✅ Linked! Scanning ${channels.length} channels into your default board...`,
    ephemeral: true,
  });

  const result = await scanGuild(interaction.guild);
  await interaction.followUp({
    content: `✅ Done. Indexed ${result.fileCount} files.`,
    ephemeral: true,
  });
}

async function handleUnlink(interaction) {
  if (!interaction.memberPermissions.has("ManageGuild")) {
    return interaction.reply({ content: "❌ Only admins can unlink.", ephemeral: true });
  }
  const doc = await db.collection("discordServers").doc(interaction.guildId).get();
  if (!doc.exists || !doc.data().linked) {
    return interaction.reply({ content: "⚠️ Not currently linked.", ephemeral: true });
  }
  await db.collection("discordServers").doc(interaction.guildId).update({
    linked: false,
    unlinkedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await interaction.reply({ content: "✅ Unlinked. Existing files stay on your boards.", ephemeral: true });
}

async function handleStatus(interaction) {
  const doc = await db.collection("discordServers").doc(interaction.guildId).get();
  if (!doc.exists || !doc.data().linked) {
    return interaction.reply({ content: "⚪ Not linked. Use `/link <code>` to connect.", ephemeral: true });
  }
  const data = doc.data();
  await interaction.reply({
    content: `🟢 Linked\n📂 Scanning ${data.selectedChannels.length} channels`,
    ephemeral: true,
  });
}

async function handleScan(interaction) {
  if (!interaction.memberPermissions.has("ManageGuild")) {
    return interaction.reply({ content: "❌ Only admins can rescan.", ephemeral: true });
  }
  const doc = await db.collection("discordServers").doc(interaction.guildId).get();
  if (!doc.exists || !doc.data().linked) {
    return interaction.reply({ content: "❌ Not linked. Use /link first.", ephemeral: true });
  }
  await interaction.reply({ content: "⏳ Scanning...", ephemeral: true });
  const result = await scanGuild(interaction.guild);
  await interaction.followUp({
    content: `✅ Done. Indexed ${result.fileCount} files in ${result.channelCount} channels.`,
    ephemeral: true,
  });
}

module.exports = { handleLink, handleUnlink, handleStatus, handleScan };