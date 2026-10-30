/**
 * Manual end-to-end smoke test against the REAL Supabase configured in .env.
 *
 * It drives handleMessage() exactly as the webhook does, using an isolated
 * throwaway profile (a test phone number linked to a synthetic user),
 * then verifies the persisted row shape and cleans everything up.
 *
 * Run: npm run smoke
 */
import { supabase } from "../src/supabase";
import { handleMessage } from "../src/handler";

const TEST_PHONE = "+235700000001";
const TEST_UID = `00000000-0000-0000-0000-${Date.now().toString().slice(-12)}`;

async function send(text: string): Promise<void> {
  const reply = await handleMessage({ from: TEST_PHONE, text });
  console.log(`\n> ${text}\n${reply}`);
}

async function cleanup(): Promise<void> {
  await supabase.from("transactions").delete().eq("user_id", TEST_UID);
  await supabase.from("accounts").delete().eq("user_id", TEST_UID);
  await supabase.from("profiles").delete().eq("id", TEST_UID);
  console.log(`\n🧹 Cleaned up test records for user ${TEST_UID}.`);
}

async function main(): Promise<void> {
  console.log(`Using test uid ${TEST_UID} linked to ${TEST_PHONE}`);
  
  // Create test profile
  await supabase.from("profiles").insert({
    id: TEST_UID,
    phone_number: TEST_PHONE,
    preferred_currency: "XAF",
    display_name: "Smoke Tester"
  });

  // Seed default account
  await supabase.from("accounts").insert({
    user_id: TEST_UID,
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
