require("dotenv").config();
const { db } = require("./firebase");
const admin = require("firebase-admin");

async function setup() {
  const userId = "test-user-" + Date.now();

  await db.collection("users").doc(userId).set({
    email: "test@example.com",
    displayName: "Test User",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const boardRef = await db.collection("boards").add({
    name: "Inbox",
    ownerId: userId,
    members: [userId],
    isInbox: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection("users").doc(userId).update({ defaultBoardId: boardRef.id });

  const code = "FW-" + Math.random().toString(36).substring(2, 8).toUpperCase();
  const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 60 * 60 * 1000));

  await db.collection("linkCodes").doc(code).set({
    userId,
    expiresAt,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log("\n✅ Test setup complete!\n");
  console.log(`User ID:  ${userId}`);
  console.log(`Board ID: ${boardRef.id}`);
  console.log(`\n🔑 LINK CODE: ${code}\n`);
  console.log(`In Discord run: /link code:${code}\n`);
}

setup().catch(console.error).finally(() => process.exit());