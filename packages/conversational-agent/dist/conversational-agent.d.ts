import type { ConversationConfig, Draft } from './types';
export declare class ConversationalAgent {
    private config;
    private agent;
    private memory;
    private userContexts;
    private drafts;
    constructor(config: ConversationConfig);
    initialize(): Promise<void>;
    processMessage(message: string, sessionId: string): Promise<string>;
    private updateUserContext;
    private analyzeIntent;
    private analyzeWritingStyle;
    private handleCommand;
    private handleTaskRequest;
    private handleCasualChat;
    private handleConfirmation;
    private generateConversationalResponse;
    private adaptResponseStyle;
    createDraft(type: 'email' | 'calendar' | 'task', content: any, summary: string, sessionId: string): Promise<string>;
    getDraft(draftId: string): Draft | undefined;
}
//# sourceMappingURL=conversational-agent.d.ts.map