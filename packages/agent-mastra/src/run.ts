import { buildAgent } from './agent';

export type AgentRunnerConfig = {
  provider: string;
  modelId?: string | null;
  pgUrl: string;
  workingScope?: 'thread' | 'resource';
  lastMessages?: number;
  recallTopK?: number;
  recallRange?: number;
  mcpServers?: Record<string, { url?: string, bearer?: string }>;
};

export async function runOnce(conf: AgentRunnerConfig, text: string, sessionId: string) {
  const { agent, mcp } = await buildAgent(conf);
  const resp = await agent.generate(text, {
    threadId: sessionId,
    resourceId: sessionId,
    toolsets: mcp ? await mcp.getToolsets() : undefined,
  });
  await mcp?.disconnect();
  return resp.outputText();
}