require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link this server to your FileWeb account")
    .addStringOption(opt => opt.setName("code").setDescription("Code from FileWeb dashboard").setRequired(true)),
  new SlashCommandBuilder().setName("unlink").setDescription("Disconnect this server"),
  new SlashCommandBuilder().setName("status").setDescription("Check FileWeb status"),
  new SlashCommandBuilder().setName("scan").setDescription("Manually rescan files"),
].map(c => c.toJSON());

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("Registering slash commands...");
    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands });
    console.log(`✅ Registered ${commands.length} commands`);
  } catch (err) {
    console.error(err);
  }
})();