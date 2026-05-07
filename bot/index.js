require("dotenv").config();
const { Client, GatewayIntentBits, Events } = require("discord.js");
const { scanGuild, saveFileItem } = require("./scanner");
const { handleLink, handleUnlink, handleStatus, handleScan } = require("./commands");
const { db } = require("./firebase");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
  console.log(`📡 In ${client.guilds.cache.size} servers`);
  for (const [, guild] of client.guilds.cache) {
    await scanGuild(guild);
  }
  console.log("🎉 Initial scan complete");
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    if (interaction.commandName === "link") await handleLink(interaction);
    else if (interaction.commandName === "unlink") await handleUnlink(interaction);
    else if (interaction.commandName === "status") await handleStatus(interaction);
    else if (interaction.commandName === "scan") await handleScan(interaction);
  } catch (err) {
    console.error("Command error:", err);
    if (!interaction.replied) {
      await interaction.reply({ content: "❌ Something went wrong.", ephemeral: true });
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || message.attachments.size === 0 || !message.guild) return;
  const serverDoc = await db.collection("discordServers").doc(message.guild.id).get();
  if (!serverDoc.exists || !serverDoc.data().linked) return;
  const { selectedChannels, defaultBoardId, ownerId } = serverDoc.data();
  if (!selectedChannels.includes(message.channel.id)) return;
  for (const [, attachment] of message.attachments) {
    try {
      await saveFileItem(attachment, message, defaultBoardId, ownerId);
      console.log(`📎 ${attachment.name}`);
    } catch (err) {
      console.error("Save error:", err);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);