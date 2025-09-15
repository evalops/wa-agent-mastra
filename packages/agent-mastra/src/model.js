import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
export function modelFrom(provider, modelId) {
    const p = (provider || 'openai').toLowerCase();
    if (p === 'anthropic')
        return anthropic(modelId || process.env.ANTHROPIC_MODEL_ID || 'claude-3-5-sonnet-latest');
    return openai(modelId || process.env.OPENAI_MODEL_ID || 'gpt-4o-mini');
}
