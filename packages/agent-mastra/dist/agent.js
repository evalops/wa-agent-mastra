import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { PostgresStore, PgVector } from '@mastra/pg';
import { MCPClient } from '@mastra/mcp';
import { modelFrom } from './model';
export async function buildAgent(opts) {
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
    let mcp = null;
    if (opts.mcpServers && Object.keys(opts.mcpServers).length > 0) {
        const servers = {};
        for (const [name, cfg] of Object.entries(opts.mcpServers)) {
            if (cfg.url) {
                servers[name] = {
                    url: new URL(cfg.url),
                    requestInit: cfg.bearer ? { headers: { Authorization: `Bearer ${cfg.bearer}` } } : undefined
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
