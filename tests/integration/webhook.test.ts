import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import twilio from 'twilio';

// Mock the agent runner
jest.mock('../../packages/agent-mastra/src/run', () => ({
  runOnce: jest.fn().mockResolvedValue('Test response from agent')
}));

// Mock the persistence layer
jest.mock('../../packages/persistence-sqlite/src/index', () => ({
  init: jest.fn(),
  setSessionProvider: jest.fn(),
  getSessionProvider: jest.fn().mockReturnValue({
    provider: 'openai',
    model_id: 'gpt-4'
  })
}));

describe('WhatsApp Webhook Integration', () => {
  let app: express.Application;
  let mockTwilioClient: any;

  beforeAll(() => {
    // Set required environment variables
    process.env.TWILIO_ACCOUNT_SID = 'ACtest123';
    process.env.TWILIO_AUTH_TOKEN = 'testtoken123';
    process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+14155238886';
    process.env.NODE_ENV = 'test';

    // Mock Twilio client
    mockTwilioClient = {
      messages: {
        create: jest.fn().mockResolvedValue({ sid: 'SMtest123' })
      }
    };

    jest.spyOn(twilio, 'default').mockReturnValue(mockTwilioClient as any);

    // Create Express app with minimal setup
    app = express();
    app.use(express.urlencoded({ extended: false }));

    // Add the webhook endpoint (simplified version)
    app.post('/twilio/whatsapp/inbound', async (req, res) => {
      const { From, Body } = req.body;

      if (!From || !Body) {
        return res.status(204).end();
      }

      // Handle commands
      if (Body.toLowerCase().startsWith('/provider')) {
        return res.status(204).end();
      }

      if (Body.toLowerCase() === '/reset') {
        return res.status(204).end();
      }

      // Process message
      res.status(204).end();

      try {
        const { runOnce } = await import('../../packages/agent-mastra/src/run');
        const reply = await runOnce({
          provider: 'openai',
          modelId: 'gpt-4',
          pgUrl: 'postgres://test',
          workingScope: 'resource'
        }, Body, From);

        await mockTwilioClient.messages.create({
          from: process.env.TWILIO_WHATSAPP_FROM,
          to: From,
          body: reply
        });
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('POST /twilio/whatsapp/inbound', () => {
    it('should handle valid WhatsApp message', async () => {
      const response = await request(app)
        .post('/twilio/whatsapp/inbound')
        .send({
          From: 'whatsapp:+1234567890',
          Body: 'Hello, how are you?',
          MessageSid: 'SMtest456'
        })
        .expect(204);

      expect(response.status).toBe(204);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockTwilioClient.messages.create).toHaveBeenCalledWith({
        from: 'whatsapp:+14155238886',
        to: 'whatsapp:+1234567890',
        body: 'Test response from agent'
      });
    });

    it('should handle /provider command', async () => {
      const response = await request(app)
        .post('/twilio/whatsapp/inbound')
        .send({
          From: 'whatsapp:+1234567890',
          Body: '/provider anthropic',
          MessageSid: 'SMtest789'
        })
        .expect(204);

      expect(response.status).toBe(204);
    });

    it('should handle /reset command', async () => {
      const response = await request(app)
        .post('/twilio/whatsapp/inbound')
        .send({
          From: 'whatsapp:+1234567890',
          Body: '/reset',
          MessageSid: 'SMtest101'
        })
        .expect(204);

      expect(response.status).toBe(204);
    });

    it('should handle missing From field', async () => {
      const response = await request(app)
        .post('/twilio/whatsapp/inbound')
        .send({
          Body: 'Test message',
          MessageSid: 'SMtest102'
        })
        .expect(204);

      expect(response.status).toBe(204);
      expect(mockTwilioClient.messages.create).not.toHaveBeenCalled();
    });

    it('should handle missing Body field', async () => {
      const response = await request(app)
        .post('/twilio/whatsapp/inbound')
        .send({
          From: 'whatsapp:+1234567890',
          MessageSid: 'SMtest103'
        })
        .expect(204);

      expect(response.status).toBe(204);
      expect(mockTwilioClient.messages.create).not.toHaveBeenCalled();
    });
  });
});