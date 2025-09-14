import 'dotenv/config';
import express from 'express';
import pino from 'pino';
import twilio from 'twilio';
import { runOnce } from '@agent/runner';
import { init as initSessions, setSessionProvider, getSessionProvider } from '@persistence/sqlite';

const log = pino({ name: 'whatsapp-gateway' });
const app = express();
app.use(express.urlencoded({ extended: false }));

// Init session db for provider/model overrides
initSessions(process.env.SQLITE_DB_PATH || 'data/sessions.db');

const shouldValidate = process.env.NODE_ENV !== 'test';
const twilioWebhookMw = twilio.webhook({ validate: shouldValidate });

const accountSid = process.env.TWILIO_ACCOUNT_SID!;
const authToken = process.env.TWILIO_AUTH_TOKEN!;
const fromWhatsApp = process.env.TWILIO_WHATSAPP_FROM!;
if (!accountSid || !authToken || !fromWhatsApp) throw new Error('Missing Twilio env vars');
const client = twilio(accountSid, authToken);

function readRunnerConfig(forSession: string) {
  const pref = getSessionProvider(forSession);
  const effectiveProvider = (pref.provider || process.env.MODEL_PROVIDER || 'openai').toLowerCase();
  const effectiveModel = pref.model_id || undefined;

  // Collect MCP servers from env: MCP_<NAME>_URL and optional MCP_<NAME>_BEARER
  const mcpServers: Record<string, { url?: string, bearer?: string }> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('MCP_') && k.endsWith('_URL') && v) {
      const name = k.slice(4, -4).toLowerCase(); // strip MCP_ and _URL
      const bearer = process.env[`MCP_${name.toUpperCase()}_BEARER`];
      mcpServers[name] = { url: v as string, bearer: (bearer as string) || undefined };
    }
  }

  return {
    provider: effectiveProvider,
    modelId: effectiveModel,
    pgUrl: process.env.DATABASE_URL || 'postgres://localhost:5432/wa_agent',
    workingScope: (process.env.WORKING_MEMORY_SCOPE as any) || 'resource',
    lastMessages: Number(process.env.LAST_MESSAGES || 16),
    recallTopK: Number(process.env.SEMANTIC_RECALL_TOPK || 4),
    recallRange: Number(process.env.SEMANTIC_RECALL_RANGE || 2),
    mcpServers,
  };
}

app.post('/twilio/whatsapp/inbound', twilioWebhookMw, async (req, res) => {
  const from: string = req.body.From; // "whatsapp:+1..."
  const text: string = req.body.Body || '';
  if (!from || !text) { res.status(204).end(); return; }

  const t = (text || '').trim();
  const lower = t.toLowerCase();
  if (lower.startsWith('/provider')) {
    const parts = t.split(/\s+/);
    if (parts.length >= 2) {
      const provider = parts[1].toLowerCase();
      const modelId = parts[2] || null;
      setSessionProvider(from, provider, modelId);
      res.status(204).end();
      try { await client.messages.create({ from: fromWhatsApp, to: from, body: `Provider set to ${provider}${modelId?' ('+modelId+')':''}.` }); } catch {}
      return;
    }
  }
  if (lower === '/reset') {
    res.status(204).end();
    try { await client.messages.create({ from: fromWhatsApp, to: from, body: 'Session reset.' }); } catch {}
    return;
  }

  res.status(204).end(); // ACK

  try {
    const reply = await runOnce(readRunnerConfig(from), text, from);
    await client.messages.create({ from: fromWhatsApp, to: from, body: reply });
  } catch (err) {
    log.error({ err }, 'Agent error');
    try { await client.messages.create({ from: fromWhatsApp, to: from, body: 'Sorry — something went wrong.' }); } catch {}
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => log.info({ port }, 'WhatsApp gateway listening'));