export interface ExecutionConfig {
    provider: string;
    modelId?: string | null;
    pgUrl: string;
    workingScope?: 'thread' | 'resource';
    lastMessages?: number;
    recallTopK?: number;
    recallRange?: number;
    mcpServers?: Record<string, {
        url?: string;
        bearer?: string;
    }>;
}
export interface TaskRequest {
    goal: string;
    context?: string;
    sessionId: string;
    messageId?: string;
    parallel?: boolean;
}
export interface ExecutionResponse {
    success: boolean;
    result?: string;
    error?: string;
    needsConfirmation?: boolean;
    draftId?: string;
    actionType?: 'email' | 'calendar' | 'search' | 'task' | 'automation';
    toolsUsed?: string[];
}
export interface TriggerDefinition {
    id: string;
    type: 'email' | 'cron';
    condition: string;
    action: string;
    repeating: boolean;
    enabled: boolean;
    sessionId: string;
    created: number;
}
export interface SearchResult {
    source: string;
    type: string;
    content: string;
    relevance: number;
    metadata?: Record<string, any>;
}
//# sourceMappingURL=types.d.ts.map