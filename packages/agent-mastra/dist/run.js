import { buildAgent } from './agent';
export async function runOnce(conf, text, sessionId) {
    const { agent, mcp } = await buildAgent(conf);
    const resp = await agent.generate(text, {
        threadId: sessionId,
        resourceId: sessionId,
        toolsets: mcp ? await mcp.getToolsets() : undefined,
    });
    await mcp?.disconnect();
    return resp.text;
}
