import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ResilientFunction, makeResilient, ErrorWithRetry } from '../../packages/resilience/src/index';

describe('Resilience Package', () => {
  let mockFunction: jest.MockedFunction<(...args: any[]) => Promise<any>>;

  beforeEach(() => {
    mockFunction = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ResilientFunction', () => {
    it('should retry on transient failures', async () => {
      mockFunction
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Service unavailable'))
        .mockResolvedValueOnce('success');

      const resilient = new ResilientFunction(
        mockFunction,
        'test-service',
        { retries: 3, minTimeout: 100 }
      );

      const result = await resilient.execute();

      expect(result).toBe('success');
      expect(mockFunction).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      const error = new Error('Invalid input');
      (error as any).statusCode = 400;
      mockFunction.mockRejectedValue(error);

      const resilient = new ResilientFunction(
        mockFunction,
        'test-service',
        { retries: 3 }
      );

      await expect(resilient.execute()).rejects.toThrow('Invalid input');
      expect(mockFunction).toHaveBeenCalledTimes(1);
    });

    it('should open circuit breaker after threshold', async () => {
      mockFunction.mockRejectedValue(new Error('Service down'));

      const resilient = new ResilientFunction(
        mockFunction,
        'test-service',
        { retries: 0 },
        {
          errorThresholdPercentage: 50,
          resetTimeout: 1000,
          rollingCountTimeout: 1000,
          rollingCountBuckets: 1
        }
      );

      // Trigger multiple failures
      for (let i = 0; i < 5; i++) {
        try {
          await resilient.execute();
        } catch (e) {
          // Expected failures
        }
      }

      // Circuit should be open now
      await expect(resilient.execute()).rejects.toThrow();

      const state = resilient.getState();
      expect(state.state).toBe('open');
    });

    it('should track statistics', async () => {
      mockFunction.mockResolvedValue('success');

      const resilient = new ResilientFunction(mockFunction, 'test-service');

      await resilient.execute();
      await resilient.execute();

      const stats = resilient.getStats();
      expect(stats.successes).toBe(2);
      expect(stats.failures).toBe(0);
    });
  });

  describe('makeResilient', () => {
    it('should create a resilient wrapper function', async () => {
      mockFunction
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce('success');

      const resilientFn = makeResilient(
        mockFunction,
        'wrapped-service',
        {
          retry: { retries: 2, minTimeout: 50 }
        }
      );

      const result = await resilientFn('arg1', 'arg2');

      expect(result).toBe('success');
      expect(mockFunction).toHaveBeenCalledTimes(2);
      expect(mockFunction).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('ErrorWithRetry', () => {
    it('should create retryable error', () => {
      const error = new ErrorWithRetry('Temporary issue', true, 503);

      expect(error.message).toBe('Temporary issue');
      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBe(503);
    });

    it('should create non-retryable error', () => {
      const error = new ErrorWithRetry('Bad request', false, 400);

      expect(error.retryable).toBe(false);
      expect(error.statusCode).toBe(400);
    });
  });
});