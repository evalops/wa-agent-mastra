import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { PostgresStore, PgVector } from '@mastra/pg';
import pino from 'pino';
import { modelFrom } from './model';
const log = pino({ name: 'conversational-agent' });
export class ConversationalAgent {
    constructor(config) {
        this.config = config;
        this.userContexts = new Map();
        this.drafts = new Map();
    }
    async initialize() {
        const storage = new PostgresStore({ connectionString: this.config.pgUrl });
        const vector = new PgVector({ connectionString: this.config.pgUrl });
        this.memory = new Memory({
            storage,
            vector,
            options: {
                lastMessages: this.config.lastMessages ?? 16,
                workingMemory: { enabled: true, scope: this.config.workingScope ?? 'resource' },
                semanticRecall: { topK: this.config.recallTopK ?? 4, messageRange: this.config.recallRange ?? 2, scope: 'resource' }
            }
        });
        this.agent = new Agent({
            name: 'WhatsApp Conversational Agent',
            description: 'Friendly WhatsApp interface that manages conversation flow and delegates tasks to execution agents.',
            instructions: [
                'You are a conversational WhatsApp assistant similar to Poke.',
                'Be witty and warm, but never overdo it.',
                'Adapt to the user\'s texting style - use lowercase if they do.',
                'For complex tasks, delegate to the execution agent.',
                'Always confirm drafts before executing actions.',
                'Use proactive messaging when appropriate.',
                'Keep responses concise and natural.'
            ].join(' '),
            model: modelFrom(this.config.provider, this.config.modelId || undefined),
            memory: this.memory,
        });
        log.info('Conversational agent initialized');
    }
    async processMessage(message, sessionId) {
        try {
            // Update user context
            this.updateUserContext(sessionId, message);
            // Analyze message intent
            const intent = this.analyzeIntent(message);
            // Handle different types of messages
            switch (intent.type) {
                case 'command':
                    return this.handleCommand(intent.command || '', sessionId);
                case 'task':
                    return this.handleTaskRequest(message, sessionId);
                case 'chat':
                    return this.handleCasualChat(message, sessionId);
                case 'confirmation':
                    return this.handleConfirmation(intent.confirmed || false, sessionId);
                default:
                    return this.generateConversationalResponse(message, sessionId);
            }
        }
        catch (error) {
            log.error({ error, sessionId }, 'Error processing message');
            return 'Sorry, something went wrong. Let me try that again.';
        }
    }
    updateUserContext(sessionId, message) {
        const context = this.userContexts.get(sessionId) || { sessionId };
        context.lastMessageTime = Date.now();
        context.conversationHistory = context.conversationHistory || [];
        context.conversationHistory.push(message);
        // Keep only last 10 messages for style analysis
        if (context.conversationHistory.length > 10) {
            context.conversationHistory = context.conversationHistory.slice(-10);
        }
        // Analyze writing style
        context.writingStyle = this.analyzeWritingStyle(context.conversationHistory);
        this.userContexts.set(sessionId, context);
    }
    analyzeIntent(message) {
        const lower = message.toLowerCase().trim();
        // Commands
        if (lower.startsWith('/')) {
            return { type: 'command', command: lower };
        }
        // Confirmations
        if (['yes', 'y', 'ok', 'confirm', 'send it', 'looks good'].some(word => lower.includes(word))) {
            return { type: 'confirmation', confirmed: true };
        }
        if (['no', 'n', 'cancel', 'stop', 'don\'t send'].some(word => lower.includes(word))) {
            return { type: 'confirmation', confirmed: false };
        }
        // Task requests (contain action verbs or specific keywords)
        const taskKeywords = ['schedule', 'remind', 'send', 'create', 'find', 'search', 'email', 'calendar', 'book', 'draft'];
        if (taskKeywords.some(keyword => lower.includes(keyword))) {
            return { type: 'task' };
        }
        // Casual chat
        const chatKeywords = ['hi', 'hello', 'hey', 'what\'s up', 'how are you', 'thanks', 'bye'];
        if (chatKeywords.some(keyword => lower.includes(keyword))) {
            return { type: 'chat' };
        }
        return { type: 'task' }; // Default to task for ambiguous messages
    }
    analyzeWritingStyle(messages) {
        const combined = messages.join(' ').toLowerCase();
        const styles = [];
        if (combined.includes('lol') || combined.includes('lmao') || combined.includes('haha')) {
            styles.push('casual-humor');
        }
        if (messages.some(msg => msg === msg.toLowerCase())) {
            styles.push('lowercase');
        }
        if (messages.some(msg => msg.length < 10)) {
            styles.push('brief');
        }
        return styles.join(',') || 'neutral';
    }
    async handleCommand(command, sessionId) {
        // Handle system commands
        if (command === '/reset') {
            this.userContexts.delete(sessionId);
            return 'Session reset. Fresh start!';
        }
        if (command.startsWith('/provider')) {
            // This would be handled by the server's provider logic
            return 'Provider settings updated.';
        }
        return 'Command not recognized. Try /reset or /provider.';
    }
    async handleTaskRequest(message, sessionId) {
        // This is where we would delegate to the execution agent
        // For now, simulate delegation
        log.info({ message, sessionId }, 'Delegating task to execution agent');
        // Generate contextual response while "working"
        const workingMessages = [
            'Let me handle that for you...',
            'Working on it...',
            'Looking into that...',
            'On it...'
        ];
        const response = workingMessages[Math.floor(Math.random() * workingMessages.length)];
        // TODO: Actually delegate to execution agent
        // const executionResponse = await this.delegateToExecutionAgent(message, sessionId);
        return response;
    }
    async handleCasualChat(message, sessionId) {
        const context = this.userContexts.get(sessionId);
        const style = context?.writingStyle || 'neutral';
        // Generate response using the conversational agent
        const response = await this.agent.generate([{
                role: 'user',
                content: message,
                resourceId: sessionId
            }], {
            resourceId: sessionId,
            threadId: sessionId
        });
        return this.adaptResponseStyle(response.text, style);
    }
    async handleConfirmation(confirmed, sessionId) {
        // Handle draft confirmations
        const pendingDraft = Array.from(this.drafts.values())
            .find(draft => draft.id.startsWith(sessionId));
        if (pendingDraft) {
            if (confirmed) {
                // Execute the draft
                this.drafts.delete(pendingDraft.id);
                return `Got it! ${pendingDraft.summary} executed.`;
            }
            else {
                // Cancel the draft
                this.drafts.delete(pendingDraft.id);
                return 'No problem, cancelled that.';
            }
        }
        return confirmed ? 'Confirmed!' : 'Cancelled.';
    }
    async generateConversationalResponse(message, sessionId) {
        const context = this.userContexts.get(sessionId);
        const style = context?.writingStyle || 'neutral';
        const response = await this.agent.generate([{
                role: 'user',
                content: message,
                resourceId: sessionId
            }], {
            resourceId: sessionId,
            threadId: sessionId
        });
        return this.adaptResponseStyle(response.text, style);
    }
    adaptResponseStyle(response, style) {
        if (style.includes('lowercase')) {
            response = response.toLowerCase();
        }
        if (style.includes('brief')) {
            // Truncate overly long responses
            const sentences = response.split('. ');
            if (sentences.length > 2) {
                response = sentences.slice(0, 2).join('. ') + '.';
            }
        }
        return response;
    }
    async createDraft(type, content, summary, sessionId) {
        const draftId = `${sessionId}-${Date.now()}`;
        const draft = {
            id: draftId,
            type,
            content,
            summary,
            created: Date.now()
        };
        this.drafts.set(draftId, draft);
        return draftId;
    }
    getDraft(draftId) {
        return this.drafts.get(draftId);
    }
}
