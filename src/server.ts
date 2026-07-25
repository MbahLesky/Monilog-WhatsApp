import type { IncomingMessage, ServerResponse } from "node:http";
import express, { type Request } from "express";
import { config } from "./config";
import { handleMessage } from "./handler";
import { selectProvider } from "./providers";
import type { OutboundReply } from "./providers/types";

const provider = selectProvider();
const app = express();

// Capture the raw body during parsing so providers can verify signatures over the
// exact bytes received. Signature matches Express's VerifyFunction (raw http types).
function captureRawBody(req: IncomingMessage, _res: ServerResponse, buffer: Buffer): void {
  (req as Request).rawBody = buffer.toString("utf8");
}

app.use(express.json({ verify: captureRawBody, type: ["application/json"] }));
app.use(
  express.urlencoded({
    extended: false,
    verify: captureRawBody,
    type: ["application/x-www-form-urlencoded"]
  })
);

function fullUrl(req: Request): string {
  if (config.publicUrl) return `${config.publicUrl}${req.originalUrl}`;
  const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol;
  const host = (req.headers["x-forwarded-host"] as string) ?? req.get("host") ?? "";
  return `${proto}://${host}${req.originalUrl}`;
}

function toStringParams(body: unknown): Record<string, string> {
  if (!body || typeof body !== "object") return {};
  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).map(([key, value]) => [
      key,
      Array.isArray(value) ? String(value[0] ?? "") : String(value)
    ])
  );
}

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", provider: provider.name });
});

app.get("/", (_req, res) => {
  res.status(200).send("Monilog WhatsApp bot is running.");
});

// Webhook verification (Meta GET challenge) + a friendly response otherwise.
app.get("/webhook/whatsapp", (req, res) => {
  if (typeof req.query["hub.mode"] !== "undefined") {
    const challenge = provider.handleVerification(req.query as Record<string, unknown>);
    if (challenge) {
      res.status(200).send(challenge);
      return;
    }
    res.sendStatus(403);
    return;
  }
  res.status(200).send("Monilog WhatsApp webhook is running.");
});

// Inbound messages.
app.post("/webhook/whatsapp", async (req, res) => {
  const rawBody = req.rawBody ?? "";

  if (!config.skipSignatureCheck) {
    const valid = provider.verifySignature({
      rawBody,
      headers: req.headers,
      url: fullUrl(req),
      params: toStringParams(req.body)
    });
    if (!valid) {
      console.warn("Rejected webhook with invalid signature.");
      res.sendStatus(403);
      return;
    }
  }

  const messages = provider.parseInbound({ rawBody, body: req.body });

  const replies: OutboundReply[] = [];
  for (const message of messages) {
    const text = await handleMessage(message);
    replies.push({ to: message.from, text });
  }

  await provider.sendReplies(replies, res);
});

app.listen(config.port, () => {
  console.log(
    `Monilog WhatsApp bot listening on :${config.port} ` +
      `(provider=${provider.name}, signatureCheck=${!config.skipSignatureCheck})`
  );
});
