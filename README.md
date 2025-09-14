# WhatsApp Agent — Mastra + Postgres + MCP (Final)

- **WhatsApp (Twilio)** webhook gateway
- **Mastra Agent + Memory** on **Postgres** with **pgvector**
- **MCP tools** via `@mastra/mcp` (remote servers; Bearer auth supported)
- **OpenAI + Anthropic** routing, per-session override stored in SQLite

## Quickstart

```bash
pnpm i
pnpm -r --filter ./packages/* run build
cp .env.example .env
# Set TWILIO_*; set DATABASE_URL; set OPENAI/ANTHROPIC keys; optional MCP_*.
# Ensure Postgres has pgvector:
#   psql "$DATABASE_URL" -c 'CREATE EXTENSION IF NOT EXISTS vector;'
pnpm dev
# Expose inbound webhook -> https://<public>/twilio/whatsapp/inbound
```

**WhatsApp commands**
- `/provider openai` or `/provider anthropic` (optionally `/provider openai gpt-4o-mini`)
- `/reset`

## Layout
apps/whatsapp-gateway/        # Express webhook + Twilio send
packages/agent-mastra/        # Mastra Agent + Memory (Postgres) + MCP client
packages/persistence-sqlite/  # per-session provider/model prefs
packages/shared/              # helpers