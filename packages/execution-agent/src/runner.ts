import { ExecutionAgent } from './execution-agent';
import type { ExecutionConfig, TaskRequest, ExecutionResponse } from './types';

let agentInstance: ExecutionAgent | null = null;

export async function runExecution(
  config: ExecutionConfig,
  request: TaskRequest
): Promise<ExecutionResponse> {
  // Initialize agent if needed (singleton pattern)
  if (!agentInstance) {
    agentInstance = new ExecutionAgent(config);
    await agentInstance.initialize();
  }

  return agentInstance.executeTask(request);
}