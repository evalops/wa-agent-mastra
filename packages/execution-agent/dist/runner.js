import { ExecutionAgent } from './execution-agent';
let agentInstance = null;
export async function runExecution(config, request) {
    // Initialize agent if needed (singleton pattern)
    if (!agentInstance) {
        agentInstance = new ExecutionAgent(config);
        await agentInstance.initialize();
    }
    return agentInstance.executeTask(request);
}
