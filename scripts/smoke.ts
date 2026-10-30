/**
 * Manual end-to-end smoke test against the REAL Supabase configured in .env.
 *
 * It drives handleMessage() exactly as the webhook does, using an isolated
 * throwaway auth user with an E.164 phone number, verifies conversational
 * transaction logging, queries, edits, and cleans everything up.
 *
 * Run: npm run smoke
 */
import { supabase } from "../src/supabase";
import { handleMessage } from "../src/handler";

const TEST_PHONE = "+235700000001";
let testUid = "";

async function send(text: string): Promise<void> {
  const reply = await handleMessage({ from: TEST_PHONE, text });
  console.log(`\n> ${text}\n${reply}`);
}

async function cleanup(): Promise<void> {
  if (!testUid) return;
  await supabase.from("transactions").delete().eq("user_id", testUid);
  await supabase.from("accounts").delete().eq("user_id", testUid);
  await supabase.from("profiles").delete().eq("id", testUid);
  try {
    await supabase.auth.admin.deleteUser(testUid);
  } catch {}
  console.log(`\n🧹 Cleaned up test user ${testUid} (${TEST_PHONE}).`);
}

async function main(): Promise<void> {
  console.log(`Creating test user for ${TEST_PHONE}...`);
  
  // Clean up any stale user from earlier runs
  const { data: existingProfiles } = await supabase
    .from("profiles")
    .select("id")
    .eq("phone_number", TEST_PHONE);
  if (existingProfiles && existingProfiles.length > 0) {
    for (const p of existingProfiles) {
      await supabase.from("transactions").delete().eq("user_id", p.id);
      await supabase.from("accounts").delete().eq("user_id", p.id);
      await supabase.from("profiles").delete().eq("id", p.id);
      try {
        await supabase.auth.admin.deleteUser(p.id);
      } catch {}
    }
  }

  // Create real test auth user with verified phone number
  const { data: userRecord, error: userError } = await supabase.auth.admin.createUser({
    phone: TEST_PHONE,
    phone_confirm: true,
    user_metadata: { preferred_currency: "XAF", display_name: "Smoke Tester" }
  });

  if (userError || !userRecord?.user) {
    throw new Error(`Failed to create test auth user: ${userError?.message}`);
  }

  testUid = userRecord.user.id;
  console.log(`Auth user created: ${testUid}. Initializing profile and default cash account...`);

  // Ensure profile has phone_number and preferred_currency
  await supabase.from("profiles").upsert({
    id: testUid,
    phone_number: TEST_PHONE,
    preferred_currency: "XAF",
    display_name: "Smoke Tester"
  });

  // Seed default account
  await supabase.from("accounts").upsert({
    user_id: testUid,
    name: "Cash",
    type: "cash",
    opening_balance_minor: 0,
    currency_code: "XAF",
    is_default: true
  });

  try {
    // Log + query + edit flow.
    await send("-5000 food yesterday");
    await send("+50000 salary");
    await send("2000 taxi");
    await send("balance");
    await send("spent food this month");
    await send("recent");
    await send("summary");
    await send("edit amount 6000");
    await send("undo");
  } finally {
    await cleanup();
  }
}

main().catch(console.error);
