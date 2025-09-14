# 🤖 WhatsApp AI Agent with Mastra

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.7.0-orange.svg)](https://pnpm.io/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A production-ready WhatsApp AI agent built with the [Mastra](https://mastra.ai) framework, featuring persistent memory, multi-provider LLM support, and extensible tool capabilities through Model Context Protocol (MCP).

## 🌟 Key Features

- **🔄 Multi-Provider LLM Support**: Seamlessly switch between OpenAI and Anthropic models on-the-fly
- **🧠 Intelligent Memory System**: PostgreSQL with pgvector for semantic search and conversation history
- **📱 WhatsApp Integration**: Full Twilio WhatsApp Business API integration with webhook support
- **🛠 MCP Tool Support**: Connect any MCP-compatible tools with Bearer authentication
- **💾 Session Persistence**: SQLite-based session management for user preferences
- **⚡ Real-time Processing**: Async message handling with streaming capabilities
- **🔧 Modular Architecture**: Clean monorepo structure with separated concerns

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Usage](#usage)
- [Development](#development)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- **Node.js** 18+ and **pnpm** 9.7.0+
- **PostgreSQL** 14+ with pgvector extension
- **Twilio Account** with WhatsApp Business API access
- **API Keys**: OpenAI and/or Anthropic

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/evalops/wa-agent-mastra.git
cd wa-agent-mastra
pnpm install
```

### 2. Database Setup

```sql
-- Create database
CREATE DATABASE wa_agent;

-- Connect to database
\c wa_agent;

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
# Twilio WhatsApp Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886  # Your WhatsApp Business number

# LLM Providers
MODEL_PROVIDER=openai  # or 'anthropic'
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Database
DATABASE_URL=postgres://username:password@localhost:5432/wa_agent

# Optional: MCP Tools
MCP_SENTRY_URL=https://your-mcp-server.com
MCP_SENTRY_BEARER=your-bearer-token
```

### 4. Build and Run

```bash
# Build all packages
pnpm build

# Start development server
pnpm dev
```

### 5. Configure Twilio Webhook

1. Use ngrok or similar to expose your local server:
   ```bash
   ngrok http 3000
   ```

2. In Twilio Console, set your WhatsApp webhook to:
   ```
   https://your-domain.ngrok.io/twilio/whatsapp/inbound
   ```

## 🏗 Architecture

```
wa-agent-mastra/
├── apps/
│   └── whatsapp-gateway/        # Express webhook server
│       └── src/
│           └── server.ts        # Twilio webhook handler
├── packages/
│   ├── agent-mastra/           # Core Mastra agent
│   │   └── src/
│   │       ├── agent.ts        # Agent initialization
│   │       ├── model.ts        # LLM provider management
│   │       ├── run.ts          # Message processing logic
│   │       └── index.ts        # Public API
│   ├── persistence-sqlite/     # Session storage
│   │   └── src/
│   │       └── index.ts        # SQLite session manager
│   └── shared/                 # Shared utilities
│       └── src/
│           └── index.ts        # Common helpers
```

### Component Responsibilities

- **WhatsApp Gateway**: Handles incoming webhooks, validates requests, sends responses
- **Mastra Agent**: Processes messages, manages memory, executes tools
- **Persistence Layer**: Stores user preferences and session data
- **Shared Utils**: Common functionality across packages

## ⚙️ Configuration

### Memory Tuning

Configure memory behavior in `.env`:

```bash
WORKING_MEMORY_SCOPE=resource     # Memory isolation level
LAST_MESSAGES=16                  # Recent messages to include
SEMANTIC_RECALL_TOPK=4            # Semantic search results
SEMANTIC_RECALL_RANGE=2           # Time range for recall
```

### MCP Tools

Add any MCP-compatible tool server:

```bash
# Format: MCP_<NAME>_URL and MCP_<NAME>_BEARER
MCP_GITHUB_URL=https://github-mcp.example.com
MCP_GITHUB_BEARER=ghp_xxxxxxxxxxxx

MCP_SLACK_URL=https://slack-mcp.example.com
MCP_SLACK_BEARER=xoxb-xxxxxxxxxxxx
```

### Model Configuration

Default models can be set via environment variables:

```bash
OPENAI_MODEL_ID=gpt-4o-mini       # Default OpenAI model
ANTHROPIC_MODEL_ID=claude-3-5-sonnet-latest  # Default Anthropic model
```

## 💬 Usage

### WhatsApp Commands

Send these commands to your WhatsApp bot:

- **`/provider openai`** - Switch to OpenAI
- **`/provider anthropic`** - Switch to Anthropic
- **`/provider openai gpt-4o`** - Switch to specific model
- **`/reset`** - Clear conversation history

### Example Conversations

```
User: Hi! Can you help me analyze some data?
Bot: Of course! I'd be happy to help you analyze data. What kind of data are you working with?

User: /provider anthropic
Bot: Switched to Anthropic Claude-3.5-Sonnet

User: Now summarize this article: [URL]
Bot: [Fetches and summarizes using MCP tools if configured]
```

## 🔧 Development

### Available Scripts

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start development mode (with watch)
pnpm dev

# Type checking
pnpm typecheck

# Build specific package
pnpm --filter @agent/runner build

# Run specific app
pnpm --filter whatsapp-gateway dev
```

### Project Structure

This monorepo uses:
- **pnpm workspaces** for package management
- **TypeScript** with ES modules
- **Express** for webhook handling
- **Mastra** for agent orchestration

### Adding New MCP Tools

1. Add environment variables:
   ```bash
   MCP_YOURTOOL_URL=https://...
   MCP_YOURTOOL_BEARER=...
   ```

2. The agent automatically discovers and loads MCP tools on startup

### Extending the Agent

Modify `packages/agent-mastra/src/agent.ts` to add custom tools or behaviors:

```typescript
// Add custom tool
agent.tools.register({
  name: 'custom_tool',
  description: 'My custom tool',
  execute: async (params) => {
    // Tool logic
  }
});
```

## 📚 API Reference

### Webhook Endpoint

**POST** `/twilio/whatsapp/inbound`

Receives WhatsApp messages from Twilio.

**Request Body:**
```json
{
  "From": "whatsapp:+1234567890",
  "Body": "User message",
  "MessageSid": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

### Agent Methods

```typescript
// Process a message
await processMessage(sessionId: string, message: string, config?: Config)

// Get or create agent instance
const agent = await getOrCreateAgent(sessionId: string)

// Reset conversation
await agent.memory.reset(sessionId)
```

## 🐛 Troubleshooting

### Common Issues

**PostgreSQL Connection Failed**
```bash
# Check if PostgreSQL is running
pg_isready

# Verify connection string
psql "$DATABASE_URL" -c "SELECT 1"
```

**pgvector Extension Missing**
```sql
-- Install pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify installation
SELECT * FROM pg_extension WHERE extname = 'vector';
```

**Twilio Webhook Not Receiving Messages**
- Ensure webhook URL is publicly accessible
- Check Twilio webhook configuration in console
- Verify TWILIO_AUTH_TOKEN is correct
- Check server logs for validation errors

**Memory Not Persisting**
- Verify DATABASE_URL is correct
- Check PostgreSQL logs for errors
- Ensure pgvector extension is enabled
- Review WORKING_MEMORY_SCOPE setting

### Debug Mode

Enable verbose logging:

```typescript
// In packages/agent-mastra/src/run.ts
console.log('[DEBUG]', 'Message received:', message);
console.log('[DEBUG]', 'Memory state:', await agent.memory.get(sessionId));
```

## 📄 License

MIT License - see [LICENSE](LICENSE) for details

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 🔗 Resources

- [Mastra Documentation](https://docs.mastra.ai)
- [MCP Specification](https://modelcontextprotocol.io)
- [Twilio WhatsApp API](https://www.twilio.com/docs/whatsapp)
- [pgvector Documentation](https://github.com/pgvector/pgvector)

---

Built with ❤️ using [Mastra](https://mastra.ai) framework
