import { ConversationalAgent } from './conversational-agent';
import type { ConversationConfig } from './types';

let agentInstance: ConversationalAgent | null = null;

export async function runConversation(
  config: ConversationConfig,
  message: string,
  sessionId: string
): Promise<string> {
  // Initialize agent if needed (singleton pattern)
  if (!agentInstance) {
    agentInstance = new ConversationalAgent(config);
    await agentInstance.initialize();
  }

  return agentInstance.processMessage(message, sessionId);
}