import pRetry, { AbortError } from 'p-retry';
import CircuitBreaker from 'opossum';
import pino from 'pino';

const log = pino({ name: 'resilience' });

export interface RetryOptions {
  retries?: number;
  minTimeout?: number;
  maxTimeout?: number;
  factor?: number;
  onFailedAttempt?: (error: any) => void;
}

export interface CircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  rollingCountTimeout?: number;
  rollingCountBuckets?: number;
}

export class ResilientFunction<T = any> {
  private circuitBreaker: CircuitBreaker<T[], T>;
  private retryOptions: RetryOptions;

  constructor(
    private fn: (...args: any[]) => Promise<T>,
    private name: string,
    retryOpts?: RetryOptions,
    circuitOpts?: CircuitBreakerOptions
  ) {
    this.retryOptions = {
      retries: 3,
      minTimeout: 1000,
      maxTimeout: 10000,
      factor: 2,
      ...retryOpts
    };

    this.circuitBreaker = new CircuitBreaker(
      async (...args: any[]) => this.executeWithRetry(...args),
      {
        timeout: 30000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000,
        ...circuitOpts
      }
    );

    this.setupCircuitBreakerEvents();
  }

  private setupCircuitBreakerEvents() {
    this.circuitBreaker.on('open', () => {
      log.warn({ service: this.name }, 'Circuit breaker opened');
    });

    this.circuitBreaker.on('halfOpen', () => {
      log.info({ service: this.name }, 'Circuit breaker half-open, testing...');
    });

    this.circuitBreaker.on('close', () => {
      log.info({ service: this.name }, 'Circuit breaker closed');
    });

    this.circuitBreaker.on('timeout', () => {
      log.error({ service: this.name }, 'Circuit breaker timeout');
    });
  }

  private async executeWithRetry(...args: any[]): Promise<T> {
    return pRetry(
      async () => {
        try {
          return await this.fn(...args);
        } catch (error: any) {
          if (this.isNonRetryableError(error)) {
            throw new AbortError(error.message);
          }
          throw error;
        }
      },
      {
        ...this.retryOptions,
        onFailedAttempt: (error) => {
          log.warn({
            service: this.name,
            attempt: error.attemptNumber,
            retriesLeft: error.retriesLeft,
            error: error.message
          }, 'Retry attempt failed');

          this.retryOptions.onFailedAttempt?.(error);
        }
      }
    );
  }

  private isNonRetryableError(error: any): boolean {
    return (
      error.statusCode === 400 ||
      error.statusCode === 401 ||
      error.statusCode === 403 ||
      error.statusCode === 404 ||
      error.code === 'INVALID_INPUT' ||
      error.code === 'AUTHENTICATION_FAILED'
    );
  }

  async execute(...args: any[]): Promise<T> {
    try {
      return await this.circuitBreaker.fire(...args);
    } catch (error: any) {
      log.error({
        service: this.name,
        error: error.message,
        stack: error.stack
      }, 'Resilient function failed');
      throw error;
    }
  }

  getStats() {
    return this.circuitBreaker.stats;
  }

  getState() {
    return {
      state: this.circuitBreaker.opened ? 'open' : this.circuitBreaker.halfOpen ? 'half-open' : 'closed',
      stats: this.getStats()
    };
  }
}

export function makeResilient<T = any>(
  fn: (...args: any[]) => Promise<T>,
  name: string,
  options?: {
    retry?: RetryOptions;
    circuitBreaker?: CircuitBreakerOptions;
  }
): (...args: any[]) => Promise<T> {
  const resilientFn = new ResilientFunction(fn, name, options?.retry, options?.circuitBreaker);
  return (...args: any[]) => resilientFn.execute(...args);
}

export class ErrorWithRetry extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean = true,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'ErrorWithRetry';
  }
}

export function wrapTwilioClient(twilioClient: any) {
  const originalCreate = twilioClient.messages.create;

  twilioClient.messages.create = makeResilient(
    originalCreate.bind(twilioClient.messages),
    'twilio-send-message',
    {
      retry: {
        retries: 3,
        minTimeout: 2000,
        maxTimeout: 10000
      },
      circuitBreaker: {
        timeout: 15000,
        errorThresholdPercentage: 30,
        resetTimeout: 60000
      }
    }
  );

  return twilioClient;
}

export function wrapLLMCall<T = any>(
  llmCall: (...args: any[]) => Promise<T>,
  provider: string
): (...args: any[]) => Promise<T> {
  return makeResilient(
    llmCall,
    `llm-${provider}`,
    {
      retry: {
        retries: 2,
        minTimeout: 3000,
        maxTimeout: 15000
      },
      circuitBreaker: {
        timeout: 60000,
        errorThresholdPercentage: 40,
        resetTimeout: 120000
      }
    }
  );
}

export { pRetry, AbortError };