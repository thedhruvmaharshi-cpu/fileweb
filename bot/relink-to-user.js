require("dotenv").config();
const { db } = require("./firebase");
const admin = require("firebase-admin");

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.log("Usage: node relink-to-user.js <your-email>");
    process.exit(1);
  }

  const snap = await db.collection("users").where("email", "==", email).limit(1).get();
  if (snap.empty) {
    console.log("❌ No user found with that email. Sign up on the frontend first.");
    process.exit(1);
  }

  const userDoc = snap.docs[0];
  const userId = userDoc.id;
  const userData = userDoc.data();

  if (!userData.defaultBoardId) {
    console.log("❌ User has no default board.");
    process.exit(1);
  }

  console.log(`User: ${email}`);
  console.log(`UID:  ${userId}`);
  console.log(`Inbox: ${userData.defaultBoardId}\n`);

  const code = "FW-" + Math.random().toString(36).substring(2, 8).toUpperCase();
  const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 60 * 60 * 1000));

  await db.collection("linkCodes").doc(code).set({
    userId,
    expiresAt,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`🔑 LINK CODE: ${code}\n`);
  console.log(`Steps:`);
  console.log(`1. In Discord:  /unlink`);
  console.log(`2. In Discord:  /link code:${code}\n`);
}

main().catch(console.error).finally(() => process.exit());