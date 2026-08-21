/**
 * Manual end-to-end smoke test against the REAL Firestore configured in .env.
 *
 * It drives handleMessage() exactly as the webhook does, using an isolated
 * throwaway user (a fake number linked via a phone_links doc to a synthetic
 * uid), then verifies the persisted document shape and cleans everything up.
 *
 * Run: npm run smoke
 */
import { adminDb } from "../src/firebase";
import { handleMessage } from "../src/handler";
import type { TransactionDoc } from "../src/types";

const TEST_PHONE = "+235700000001"; // not a real subscriber
const TEST_UID = `smoke-test-${Date.now()}`;

const REQUIRED_FIELDS: (keyof TransactionDoc)[] = [
  "id",
  "userId",
  "accountId",
  "type",
  "amount",
  "description",
  "affectsAccountBalance",
  "transactionDate",
  "createdAt",
  "updatedAt",
  "deletedAt"
];

async function send(text: string): Promise<void> {
  const reply = await handleMessage({ from: TEST_PHONE, text });
  console.log(`\n> ${text}\n${reply}`);
}

async function transactionsCollection() {
  return adminDb.collection("users").doc(TEST_UID).collection("transactions");
}

async function cleanup(): Promise<void> {
  const col = await transactionsCollection();
  const snap = await col.get();
  await Promise.all(snap.docs.map((doc) => doc.ref.delete()));
  await adminDb.collection("phone_links").doc(TEST_PHONE).delete();
  console.log(`\n🧹 Cleaned up ${snap.size} transaction(s) and the phone link.`);
}

async function main(): Promise<void> {
  console.log(`Using test uid ${TEST_UID} linked to ${TEST_PHONE}`);
  await adminDb.collection("phone_links").doc(TEST_PHONE).set({ uid: TEST_UID });

  // Log + query + edit flow.
  await send("-5000 food yesterday");
  await send("+50000 salary");
  await send("2000 taxi");
  await send("balance"); // expect 50000 - 7000 = 43000
  await send("spent food this month"); // expect 5000
  await send("last 5");
  await send("summary");
  await send("edit amount 6000"); // taxi 2000 -> 6000
  await send("undo"); // soft-delete the taxi
  await send("balance"); // expect 50000 - 5000 = 45000

  // Verify persisted shape directly in Firestore.
  const col = await transactionsCollection();
  const snap = await col.get();
  const docs = snap.docs.map((doc) => doc.data() as TransactionDoc);
  console.log(`\n── Firestore verification ──`);
  console.log(`Documents written: ${docs.length}`);

  const problems: string[] = [];
  for (const doc of docs) {
    for (const field of REQUIRED_FIELDS) {
      if (doc[field] === undefined) problems.push(`${doc.id} missing "${field}"`);
    }
    if (doc.userId !== TEST_UID) problems.push(`${doc.id} wrong userId ${doc.userId}`);
    if (typeof doc.updatedAt !== "string") problems.push(`${doc.id} updatedAt not ISO string`);
  }

  const softDeleted = docs.filter((doc) => doc.deletedAt !== null);
  console.log(`Soft-deleted (undo) docs: ${softDeleted.length} (expected 1)`);
  console.log(
    "Sample doc:",
    JSON.stringify(
      docs.find((doc) => doc.type === "expense" && doc.deletedAt === null),
      null,
      2
    )
  );

  if (problems.length > 0) {
    console.error(`\n❌ Shape problems:\n - ${problems.join("\n - ")}`);
  } else {
    console.log(`\n✅ All documents match the sync-engine shape.`);
  }
}

main()
  .catch((error) => {
    console.error("Smoke test failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    // Firestore keeps the process alive; exit explicitly.
    process.exit(process.exitCode ?? 0);
  });
