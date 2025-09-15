export interface ConversationConfig {
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
}
export interface ExecutionResponse {
    success: boolean;
    result?: string;
    error?: string;
    needsConfirmation?: boolean;
    draftId?: string;
    actionType?: 'email' | 'calendar' | 'search' | 'task';
}
export interface UserContext {
    sessionId: string;
    writingStyle?: string;
    preferences?: Record<string, any>;
    lastMessageTime?: number;
    conversationHistory?: string[];
}
export interface Draft {
    id: string;
    type: 'email' | 'calendar' | 'task';
    content: any;
    summary: string;
    created: number;
}
//# sourceMappingURL=types.d.ts.map