import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { PostgresStore, PgVector } from '@mastra/pg';
import { MCPClient } from '@mastra/mcp';
import pino from 'pino';
import { modelFrom } from './model';
const log = pino({ name: 'execution-agent' });
export class ExecutionAgent {
    constructor(config) {
        this.config = config;
        this.mcp = null;
        this.triggers = new Map();
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
        // Initialize MCP if servers are configured
        if (this.config.mcpServers && Object.keys(this.config.mcpServers).length > 0) {
            const servers = {};
            for (const [name, cfg] of Object.entries(this.config.mcpServers || {})) {
                if (cfg.url) {
                    servers[name] = {
                        url: new URL(cfg.url),
                        requestInit: cfg.bearer ? { headers: { Authorization: `Bearer ${cfg.bearer}` } } : undefined
                    };
                }
            }
            this.mcp = new MCPClient({ servers });
        }
        this.agent = new Agent({
            name: 'WhatsApp Execution Agent',
            description: 'Task execution engine with MCP tools, parallel processing, and automation capabilities.',
            instructions: [
                'You are the execution engine for a WhatsApp agent.',
                'Focus on completing tasks efficiently with parallelism when possible.',
                'Use MCP tools for integrations (calendar, email, etc.).',
                'Always provide detailed results back to the conversational agent.',
                'Create drafts for actions that need confirmation.',
                'Set up triggers for proactive messaging when requested.',
                'Never make up information - only use data from tools and searches.'
            ].join(' '),
            model: modelFrom(this.config.provider, this.config.modelId || undefined),
            memory: this.memory,
            tools: this.mcp ? await this.mcp.getTools() : undefined,
        });
        log.info('Execution agent initialized with MCP tools');
    }
    async executeTask(request) {
        try {
            log.info({ request }, 'Executing task');
            // Analyze task to determine execution strategy
            const taskType = this.analyzeTaskType(request.goal);
            switch (taskType) {
                case 'search':
                    return this.executeSearch(request);
                case 'email':
                    return this.executeEmailTask(request);
                case 'calendar':
                    return this.executeCalendarTask(request);
                case 'automation':
                    return this.executeAutomationTask(request);
                case 'parallel':
                    return this.executeParallelTasks(request);
                default:
                    return this.executeGenericTask(request);
            }
        }
        catch (error) {
            log.error({ error, request }, 'Task execution failed');
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }
    analyzeTaskType(goal) {
        const lower = goal.toLowerCase();
        if (lower.includes('search') || lower.includes('find')) {
            return 'search';
        }
        if (lower.includes('email') || lower.includes('send') || lower.includes('draft')) {
            return 'email';
        }
        if (lower.includes('calendar') || lower.includes('schedule') || lower.includes('meeting')) {
            return 'calendar';
        }
        if (lower.includes('remind') || lower.includes('automation') || lower.includes('trigger')) {
            return 'automation';
        }
        if (lower.includes(' and ') || lower.includes(' also ')) {
            return 'parallel';
        }
        return 'generic';
    }
    async executeSearch(request) {
        const searchTerms = this.extractSearchTerms(request.goal);
        const results = [];
        // Execute parallel searches across different sources if MCP tools are available
        const searchPromises = [];
        if (this.mcp) {
            const tools = await this.mcp.getTools();
            // Search in different data sources based on available tools
            if (Array.isArray(tools)) {
                for (const tool of tools) {
                    if (tool.name.includes('search') || tool.name.includes('find')) {
                        searchPromises.push(this.searchWithTool(tool.name, searchTerms, request.sessionId));
                    }
                }
            }
        }
        // Wait for all searches to complete
        if (searchPromises.length > 0) {
            const searchResults = await Promise.all(searchPromises);
            for (const result of searchResults) {
                results.push(...result);
            }
        }
        // If no MCP tools available, use the agent's memory for search
        if (results.length === 0) {
            const memoryResults = await this.searchMemory(searchTerms, request.sessionId);
            results.push(...memoryResults);
        }
        const summary = this.summarizeSearchResults(results);
        return {
            success: true,
            result: summary,
            actionType: 'search',
            toolsUsed: searchPromises.length > 0 ? ['mcp-search'] : ['memory-search']
        };
    }
    async executeEmailTask(request) {
        // This would use MCP email tools to draft/send emails
        const draftId = `email-${Date.now()}`;
        // For now, simulate email draft creation
        const emailContent = {
            subject: 'Auto-generated email',
            body: 'This email was created by the WhatsApp agent.',
            to: 'user@example.com'
        };
        log.info({ draftId, emailContent }, 'Email draft created');
        return {
            success: true,
            result: 'Email draft created. Please review before sending.',
            needsConfirmation: true,
            draftId,
            actionType: 'email',
            toolsUsed: ['mcp-email']
        };
    }
    async executeCalendarTask(request) {
        // This would use MCP calendar tools to create/update events
        const draftId = `calendar-${Date.now()}`;
        // For now, simulate calendar event creation
        const eventContent = {
            title: 'Meeting scheduled via WhatsApp',
            start: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
            duration: 60 // 1 hour
        };
        log.info({ draftId, eventContent }, 'Calendar event draft created');
        return {
            success: true,
            result: 'Calendar event draft created. Please review before scheduling.',
            needsConfirmation: true,
            draftId,
            actionType: 'calendar',
            toolsUsed: ['mcp-calendar']
        };
    }
    async executeAutomationTask(request) {
        const triggerId = `trigger-${Date.now()}`;
        // Parse automation request
        const trigger = {
            id: triggerId,
            type: request.goal.includes('email') ? 'email' : 'cron',
            condition: this.extractTriggerCondition(request.goal),
            action: this.extractTriggerAction(request.goal),
            repeating: request.goal.includes('every') || request.goal.includes('daily') || request.goal.includes('weekly'),
            enabled: true,
            sessionId: request.sessionId,
            created: Date.now()
        };
        this.triggers.set(triggerId, trigger);
        log.info({ trigger }, 'Automation trigger created');
        return {
            success: true,
            result: `Automation set up: ${trigger.action} when ${trigger.condition}`,
            actionType: 'automation',
            toolsUsed: ['trigger-system']
        };
    }
    async executeParallelTasks(request) {
        // Split the goal into parallel tasks
        const tasks = this.splitIntoParallelTasks(request.goal);
        const promises = tasks.map(task => this.executeTask({
            ...request,
            goal: task,
            parallel: false // Prevent infinite recursion
        }));
        const results = await Promise.all(promises);
        const successCount = results.filter(r => r.success).length;
        const combinedResult = results
            .filter(r => r.success && r.result)
            .map(r => r.result)
            .join('\n\n');
        return {
            success: successCount > 0,
            result: combinedResult || 'Parallel tasks completed',
            actionType: 'task',
            toolsUsed: ['parallel-execution']
        };
    }
    async executeGenericTask(request) {
        // Use the agent to handle generic tasks
        const response = await this.agent.generate([{
                role: 'user',
                content: request.goal,
                resourceId: request.sessionId
            }], {
            resourceId: request.sessionId,
            threadId: request.sessionId
        });
        return {
            success: true,
            result: response.text,
            actionType: 'task',
            toolsUsed: ['agent-generate']
        };
    }
    // Helper methods
    extractSearchTerms(goal) {
        // Simple extraction - would be more sophisticated in practice
        return goal.toLowerCase()
            .replace(/find|search|look for/g, '')
            .trim()
            .split(/\s+/)
            .filter(term => term.length > 2);
    }
    async searchWithTool(toolName, terms, sessionId) {
        // This would use the actual MCP tool to search
        // For now, return mock results
        return [{
                source: toolName,
                type: 'mock',
                content: `Mock search result for: ${terms.join(' ')}`,
                relevance: 0.8
            }];
    }
    async searchMemory(terms, sessionId) {
        // Search the agent's memory
        return [{
                source: 'memory',
                type: 'conversation',
                content: `Memory search result for: ${terms.join(' ')}`,
                relevance: 0.6
            }];
    }
    summarizeSearchResults(results) {
        if (results.length === 0) {
            return 'No results found.';
        }
        const sortedResults = results.sort((a, b) => b.relevance - a.relevance);
        return sortedResults
            .slice(0, 5) // Top 5 results
            .map((result, index) => `${index + 1}. ${result.content}`)
            .join('\n');
    }
    extractTriggerCondition(goal) {
        // Extract condition from automation request
        if (goal.includes('when')) {
            return goal.split('when')[1]?.split('then')[0]?.trim() || 'unknown condition';
        }
        return 'unknown condition';
    }
    extractTriggerAction(goal) {
        // Extract action from automation request
        if (goal.includes('then')) {
            return goal.split('then')[1]?.trim() || 'unknown action';
        }
        return goal; // Fallback to the entire goal
    }
    splitIntoParallelTasks(goal) {
        // Split goal into parallel tasks based on conjunctions
        return goal
            .split(/\s+and\s+|\s+also\s+/)
            .map(task => task.trim())
            .filter(task => task.length > 0);
    }
    // Trigger management
    async createTrigger(definition) {
        const triggerId = `trigger-${Date.now()}`;
        const trigger = {
            ...definition,
            id: triggerId,
            created: Date.now()
        };
        this.triggers.set(triggerId, trigger);
        return triggerId;
    }
    async getTriggers(sessionId) {
        return Array.from(this.triggers.values())
            .filter(trigger => !sessionId || trigger.sessionId === sessionId);
    }
    async deleteTrigger(triggerId) {
        return this.triggers.delete(triggerId);
    }
}
