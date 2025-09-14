import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { PostgresStore, PgVector } from '@mastra/pg';
import { MCPClient } from '@mastra/mcp';
import { modelFrom } from './model';

type BuildOptions = {
  provider: string;
  modelId?: string | null;
  pgUrl: string;
  workingScope?: 'thread' | 'resource';
  lastMessages?: number;
  recallTopK?: number;
  recallRange?: number;
  mcpServers?: Record<string, { url?: string, bearer?: string }>;
};

export async function buildAgent(opts: BuildOptions) {
  const storage = new PostgresStore({ connectionString: opts.pgUrl });
  const vector = new PgVector({ connectionString: opts.pgUrl });
  const memory = new Memory({
    storage,
    vector,
    options: {
      lastMessages: opts.lastMessages ?? 16,
      workingMemory: { enabled: true, scope: opts.workingScope ?? 'resource' },
      semanticRecall: { topK: opts.recallTopK ?? 4, messageRange: opts.recallRange ?? 2, scope: 'resource' }
    }
  });

  // Optional MCP
  let mcp: MCPClient | null = null;
  if (opts.mcpServers && Object.keys(opts.mcpServers).length > 0) {
    const servers: Record<string, any> = {};
    for (const [name, cfg] of Object.entries(opts.mcpServers)) {
      if ((cfg as any).url) {
        servers[name] = {
          url: new URL((cfg as any).url as string),
          requestInit: (cfg as any).bearer ? { headers: { Authorization: `Bearer ${(cfg as any).bearer}` } } : undefined
        };
      }
    }
    mcp = new MCPClient({ servers });
  }

  const agent = new Agent({
    name: 'WhatsApp Agent',
    description: 'Concise WhatsApp assistant with persistent memory (Postgres) and MCP tools.',
    instructions: [
      'You are a concise WhatsApp assistant.',
      'Prefer short answers.',
      'Update working memory when the user shares stable facts.',
      'Use tools sparingly; summarize for SMS-length replies.',
    ].join(' '),
    model: modelFrom(opts.provider, opts.modelId || undefined),
    memory,
    tools: mcp ? await mcp.getTools() : undefined,
  });

  return { agent, mcp };
}