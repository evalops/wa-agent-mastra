import { ConversationalAgent } from './conversational-agent';
let agentInstance = null;
export async function runConversation(config, message, sessionId) {
    // Initialize agent if needed (singleton pattern)
    if (!agentInstance) {
        agentInstance = new ConversationalAgent(config);
        await agentInstance.initialize();
    }
    return agentInstance.processMessage(message, sessionId);
}
