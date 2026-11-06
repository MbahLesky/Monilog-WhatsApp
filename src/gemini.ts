import { GoogleGenAI } from "@google/genai";
import { config } from "./config";

function getClient(): GoogleGenAI | null {
  const key = config.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenAI({ apiKey: key });
}

export interface ParsedReceipt {
  amount: number;
  category: string;
  merchant?: string;
  note: string;
}

export interface ParsedVoice {
  type: "expense" | "income" | "query";
  amount?: number;
  category?: string;
  queryType?: "balance" | "recent" | "summary";
  note?: string;
}

/**
 * Uses Gemini 2.5 Flash Multimodal Vision to extract receipt / invoice details.
 */
export async function parseReceiptImage(
  imageBuffer: Buffer,
  mimeType = "image/jpeg"
): Promise<ParsedReceipt | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const prompt = `You are a financial receipt parser for Moniilog personal ledger.
Analyze this receipt, bill, or mobile money transfer screenshot.
Extract:
- total amount paid (numeric only, e.g. 5000)
- category (one of: Food & Dining, Transportation, Housing & Rent, Bills & Utilities, Shopping, Health & Medical, Education, Entertainment, Family & Personal, Other Expense)
- merchant name (e.g. Carrefour, Shell, Total, Restaurant name)
- brief description of items or service

Return strictly valid JSON with this exact schema, and nothing else:
{
  "amount": number,
  "category": string,
  "merchant": string,
  "note": string
}`;

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: imageBuffer.toString("base64"),
                mimeType
              }
            }
          ]
        }
      ]
    });

    const text = response.text || "";
    const cleanJson = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const data = JSON.parse(cleanJson);

    if (typeof data.amount === "number" && data.amount > 0) {
      return {
        amount: data.amount,
        category: data.category || "Other Expense",
        merchant: data.merchant,
        note: data.note || data.merchant || "Receipt expense"
      };
    }
  } catch (error) {
    console.error("Gemini receipt parsing failed:", error);
  }

  return null;
}

/**
 * Uses Gemini 2.5 Flash Audio to transcribe and extract transaction intent from a WhatsApp voice note.
 */
export async function parseVoiceNote(
  audioBuffer: Buffer,
  mimeType = "audio/ogg"
): Promise<ParsedVoice | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const prompt = `You are a voice assistant for Moniilog financial ledger.
Listen to this audio voice note from a user.
Detect if they want to:
1. Log an expense (e.g. "I spent 3000 on taxi", "bought bread 500")
2. Log an income (e.g. "I received 50000 salary", "gift from mom 10000")
3. Query balance or history (e.g. "what is my balance", "summary of this month", "show recent")

Return strictly valid JSON with this exact schema:
{
  "type": "expense" | "income" | "query",
  "amount": number (optional, for expense/income),
  "category": string (optional, e.g. Food, Transport, Bills, Shopping, Salary, Gifts),
  "queryType": "balance" | "recent" | "summary" (optional, for query),
  "note": string (brief transcription or description)
}`;

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: audioBuffer.toString("base64"),
                mimeType
              }
            }
          ]
        }
      ]
    });

    const text = response.text || "";
    const cleanJson = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    return JSON.parse(cleanJson) as ParsedVoice;
  } catch (error) {
    console.error("Gemini voice note parsing failed:", error);
  }

  return null;
}

