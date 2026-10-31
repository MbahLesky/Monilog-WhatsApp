/**
 * Daily/Weekly Proactive Financial Digest Generator
 *
 * Can be run via cron (e.g. at 20:00 every evening) to send users
 * a concise WhatsApp summary of today's spending and remaining budget.
 *
 * Run: npx tsx scripts/digest.ts
 */
import { supabase } from "../src/supabase";

async function generateDailyDigests(): Promise<void> {
  console.log("Generating Moniilog Daily Financial Digests...");

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, phone_number, display_name, preferred_currency")
    .not("phone_number", "is", null);

  if (error || !profiles) {
    console.error("Failed to fetch profiles:", error);
    return;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  for (const profile of profiles) {
    const currency = profile.preferred_currency || "XAF";
    const { data: txns } = await supabase
      .from("transactions")
      .select("amount_minor, type")
      .eq("user_id", profile.id)
      .gte("transaction_date", todayStart.toISOString())
      .is("deleted_at", null);

    const todayExpenseMinor = (txns ?? [])
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + (t.amount_minor ?? 0), 0);

    const todayIncomeMinor = (txns ?? [])
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + (t.amount_minor ?? 0), 0);

    const formattedExpense = (todayExpenseMinor / 100).toLocaleString();
    const formattedIncome = (todayIncomeMinor / 100).toLocaleString();

    const digestMessage =
      `🌙 *Good evening, ${profile.display_name || "there"}!*\n\n` +
      `Here is your Moniilog daily snapshot for today:\n` +
      `📉 *Expenses today:* ${formattedExpense} ${currency}\n` +
      (todayIncomeMinor > 0 ? `📈 *Income today:* ${formattedIncome} ${currency}\n` : "") +
      `\nReply *summary* anytime for your full monthly breakdown, or send a receipt photo to log tomorrow's expenses!`;

    console.log(`[Digest for ${profile.phone_number} (${profile.id})]:\n${digestMessage}\n---`);
  }
}

generateDailyDigests().catch(console.error);
