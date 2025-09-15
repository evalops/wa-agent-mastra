import type { ExecutionConfig, TaskRequest, ExecutionResponse, TriggerDefinition } from './types';
export declare class ExecutionAgent {
    private config;
    private agent;
    private memory;
    private mcp;
    private triggers;
    constructor(config: ExecutionConfig);
    initialize(): Promise<void>;
    executeTask(request: TaskRequest): Promise<ExecutionResponse>;
    private analyzeTaskType;
    private executeSearch;
    private executeEmailTask;
    private executeCalendarTask;
    private executeAutomationTask;
    private executeParallelTasks;
    private executeGenericTask;
    private extractSearchTerms;
    private searchWithTool;
    private searchMemory;
    private summarizeSearchResults;
    private extractTriggerCondition;
    private extractTriggerAction;
    private splitIntoParallelTasks;
    createTrigger(definition: Omit<TriggerDefinition, 'id' | 'created'>): Promise<string>;
    getTriggers(sessionId?: string): Promise<TriggerDefinition[]>;
    deleteTrigger(triggerId: string): Promise<boolean>;
}
//# sourceMappingURL=execution-agent.d.ts.map