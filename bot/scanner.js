const { db } = require("./firebase");
const admin = require("firebase-admin");

async function scanGuild(guild) {
  const serverDoc = await db.collection("discordServers").doc(guild.id).get();
  if (!serverDoc.exists || !serverDoc.data().linked) {
    console.log(`  Skipping ${guild.name} (not linked)`);
    return { fileCount: 0, channelCount: 0 };
  }

  const { ownerId, selectedChannels, defaultBoardId } = serverDoc.data();
  let fileCount = 0;
  let channelCount = 0;

  for (const channelId of selectedChannels) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) continue;

    try {
      console.log(`  Scanning #${channel.name}...`);
      let lastMessageId = null;
      let hasMore = true;

      while (hasMore) {
        const options = { limit: 100 };
        if (lastMessageId) options.before = lastMessageId;

        const messages = await channel.messages.fetch(options);
        if (messages.size === 0) break;

        for (const [, message] of messages) {
          for (const [, attachment] of message.attachments) {
            await saveFileItem(attachment, message, defaultBoardId, ownerId);
            fileCount++;
          }
        }

        lastMessageId = messages.last().id;
        if (messages.size < 100) hasMore = false;
      }
      channelCount++;
    } catch (err) {
      console.log(`  Skipped #${channel.name}: ${err.message}`);
    }
  }

  console.log(`✓ ${guild.name}: ${fileCount} files in ${channelCount} channels`);
  return { fileCount, channelCount };
}

async function saveFileItem(attachment, message, boardId, ownerId) {
  const itemId = `${message.id}_${attachment.id}`;
  const itemData = {
    type: getFileType(attachment.name),
    name: attachment.name,
    sender: message.author.username,
    senderId: message.author.id,
    channel: message.channel.name,
    channelId: message.channel.id,
    serverId: message.guild.id,
    sourceMessageId: message.id,
    sourceAttachmentId: attachment.id,
    attachmentUrl: attachment.url,
    size: formatSize(attachment.size),
    sizeBytes: attachment.size,
    timestamp: message.createdAt.toISOString(),
    x: 100 + Math.random() * 600,
    y: 100 + Math.random() * 400,
    connectedTo: [],
    addedBy: "bot",
    ownerId,
  };

  await db.collection("boards").doc(boardId).collection("items").doc(itemId).set(itemData, { merge: true });
}

function getFileType(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const types = {
    png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image",
    pdf: "document", doc: "document", docx: "document", txt: "document", md: "document",
    mp4: "video", mov: "video", avi: "video", mkv: "video", webm: "video",
    mp3: "audio", wav: "audio", ogg: "audio",
    js: "code", py: "code", ts: "code", jsx: "code", tsx: "code", html: "code", css: "code", json: "code",
    zip: "archive", rar: "archive", tar: "archive",
    xlsx: "spreadsheet", csv: "spreadsheet",
    pptx: "presentation",
    fig: "design", sketch: "design", psd: "design",
  };
  return types[ext] || "other";
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + " GB";
}

module.exports = { scanGuild, saveFileItem };