import { Pool } from 'pg';
import Redis from 'ioredis';
import { LRUCache } from 'lru-cache';
import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';

const log = pino({ name: 'performance' });

export interface ConnectionPoolConfig {
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export interface CacheConfig {
  maxSize?: number;
  ttlMs?: number;
  staleWhileRefreshMs?: number;
}

export interface RedisConfig {
  host?: string;
  port?: number;
  password?: string;
  keyPrefix?: string;
  retryDelayOnFailover?: number;
}

class ConnectionPool {
  private pgPool: Pool | null = null;
  private redis: Redis | null = null;

  async initPostgres(connectionString: string, config?: ConnectionPoolConfig) {
    if (this.pgPool) {
      log.warn('PostgreSQL pool already initialized');
      return this.pgPool;
    }

    this.pgPool = new Pool({
      connectionString,
      max: config?.maxConnections || 20,
      idleTimeoutMillis: config?.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config?.connectionTimeoutMillis || 10000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    // Handle pool events
    this.pgPool.on('connect', () => {
      log.debug('New PostgreSQL client connected');
    });

    this.pgPool.on('error', (err) => {
      log.error({ err }, 'PostgreSQL pool error');
    });

    // Test connection
    try {
      const client = await this.pgPool.connect();
      await client.query('SELECT 1');
      client.release();
      log.info('PostgreSQL connection pool initialized successfully');
    } catch (error) {
      log.error({ error }, 'Failed to initialize PostgreSQL pool');
      throw error;
    }

    return this.pgPool;
  }

  async initRedis(config?: RedisConfig) {
    if (this.redis) {
      log.warn('Redis already initialized');
      return this.redis;
    }

    const redisConfig: Redis.RedisOptions = {
      host: config?.host || 'localhost',
      port: config?.port || 6379,
      password: config?.password,
      keyPrefix: config?.keyPrefix || 'wa-agent:',
      retryDelayOnFailover: config?.retryDelayOnFailover || 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 10000,
      commandTimeout: 5000
    };

    this.redis = new Redis(redisConfig);

    this.redis.on('connect', () => {
      log.info('Redis connected');
    });

    this.redis.on('error', (err) => {
      log.error({ err }, 'Redis error');
    });

    try {
      await this.redis.connect();
      await this.redis.ping();
      log.info('Redis initialized successfully');
    } catch (error) {
      log.error({ error }, 'Failed to initialize Redis');
      throw error;
    }

    return this.redis;
  }

  getPostgres(): Pool {
    if (!this.pgPool) {
      throw new Error('PostgreSQL pool not initialized');
    }
    return this.pgPool;
  }

  getRedis(): Redis {
    if (!this.redis) {
      throw new Error('Redis not initialized');
    }
    return this.redis;
  }

  async close() {
    if (this.pgPool) {
      await this.pgPool.end();
      this.pgPool = null;
      log.info('PostgreSQL pool closed');
    }

    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      log.info('Redis connection closed');
    }
  }
}

export class AgentCache {
  private memoryCache: LRUCache<string, any>;
  private redis: Redis | null = null;

  constructor(
    private config: CacheConfig = {},
    redis?: Redis
  ) {
    this.redis = redis || null;

    this.memoryCache = new LRUCache({
      max: config.maxSize || 1000,
      ttl: config.ttlMs || 300000, // 5 minutes
      allowStale: true,
      updateAgeOnGet: true,
      updateAgeOnHas: true
    });
  }

  async get<T = any>(key: string): Promise<T | null> {
    // Try memory cache first
    const memoryResult = this.memoryCache.get(key);
    if (memoryResult !== undefined) {
      log.debug({ key }, 'Cache hit (memory)');
      return memoryResult as T;
    }

    // Try Redis if available
    if (this.redis) {
      try {
        const redisResult = await this.redis.get(key);
        if (redisResult) {
          const parsed = JSON.parse(redisResult);
          // Store in memory cache for faster future access
          this.memoryCache.set(key, parsed);
          log.debug({ key }, 'Cache hit (Redis)');
          return parsed as T;
        }
      } catch (error) {
        log.warn({ error, key }, 'Redis cache read error');
      }
    }

    log.debug({ key }, 'Cache miss');
    return null;
  }

  async set(key: string, value: any, ttlMs?: number): Promise<void> {
    const effectiveTtl = ttlMs || this.config.ttlMs || 300000;

    // Store in memory cache
    this.memoryCache.set(key, value, { ttl: effectiveTtl });

    // Store in Redis if available
    if (this.redis) {
      try {
        await this.redis.setex(
          key,
          Math.floor(effectiveTtl / 1000),
          JSON.stringify(value)
        );
        log.debug({ key, ttl: effectiveTtl }, 'Cached value');
      } catch (error) {
        log.warn({ error, key }, 'Redis cache write error');
      }
    }
  }

  async delete(key: string): Promise<void> {
    this.memoryCache.delete(key);

    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch (error) {
        log.warn({ error, key }, 'Redis cache delete error');
      }
    }
  }

  async clear(): Promise<void> {
    this.memoryCache.clear();

    if (this.redis) {
      try {
        await this.redis.flushdb();
      } catch (error) {
        log.warn({ error }, 'Redis cache clear error');
      }
    }
  }

  getStats() {
    return {
      memorySize: this.memoryCache.size,
      memoryCalculatedSize: this.memoryCache.calculatedSize,
      memoryMaxSize: this.memoryCache.max
    };
  }
}

export class AgentPool {
  private warmAgents: Map<string, any> = new Map();
  private agentCreators: Map<string, () => Promise<any>> = new Map();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize = 10, ttlMs = 600000) { // 10 minutes TTL
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  registerAgentCreator(sessionId: string, creator: () => Promise<any>) {
    this.agentCreators.set(sessionId, creator);
  }

  async getAgent(sessionId: string): Promise<any> {
    const cached = this.warmAgents.get(sessionId);
    if (cached && (Date.now() - cached.timestamp) < this.ttlMs) {
      log.debug({ sessionId }, 'Using warm agent');
      return cached.agent;
    }

    const creator = this.agentCreators.get(sessionId);
    if (!creator) {
      throw new Error(`No agent creator registered for session: ${sessionId}`);
    }

    log.debug({ sessionId }, 'Creating new agent');
    const agent = await creator();

    // Clean up old agents if we're at capacity
    if (this.warmAgents.size >= this.maxSize) {
      const oldestKey = this.warmAgents.keys().next().value;
      if (oldestKey) {
        this.warmAgents.delete(oldestKey);
        log.debug({ sessionId: oldestKey }, 'Evicted old agent');
      }
    }

    this.warmAgents.set(sessionId, {
      agent,
      timestamp: Date.now()
    });

    return agent;
  }

  cleanup() {
    const now = Date.now();
    for (const [sessionId, cached] of this.warmAgents.entries()) {
      if ((now - cached.timestamp) >= this.ttlMs) {
        this.warmAgents.delete(sessionId);
        log.debug({ sessionId }, 'Cleaned up expired agent');
      }
    }
  }

  size(): number {
    return this.warmAgents.size;
  }
}

export class MessageQueue {
  private redis: Redis;
  private queueName: string;
  private processing = false;

  constructor(redis: Redis, queueName = 'message-queue') {
    this.redis = redis;
    this.queueName = queueName;
  }

  async enqueue(data: any): Promise<string> {
    const id = uuidv4();
    const message = {
      id,
      data,
      timestamp: Date.now(),
      attempts: 0
    };

    await this.redis.lpush(this.queueName, JSON.stringify(message));
    log.debug({ id, queueName: this.queueName }, 'Message queued');

    return id;
  }

  async dequeue(): Promise<any | null> {
    const result = await this.redis.brpop(this.queueName, 1);
    if (!result) return null;

    try {
      const message = JSON.parse(result[1]);
      log.debug({ id: message.id }, 'Message dequeued');
      return message;
    } catch (error) {
      log.error({ error, raw: result[1] }, 'Failed to parse queued message');
      return null;
    }
  }

  async size(): Promise<number> {
    return await this.redis.llen(this.queueName);
  }

  async clear(): Promise<void> {
    await this.redis.del(this.queueName);
  }
}

// Singleton instances
export const connectionPool = new ConnectionPool();

// Utility functions
export async function withTransaction<T>(
  pool: Pool,
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function createCacheKey(prefix: string, ...parts: string[]): string {
  return `${prefix}:${parts.join(':')}`;
}

// Metrics collection
export class PerformanceMetrics {
  private static instance: PerformanceMetrics;
  private metrics: Map<string, number[]> = new Map();

  static getInstance(): PerformanceMetrics {
    if (!PerformanceMetrics.instance) {
      PerformanceMetrics.instance = new PerformanceMetrics();
    }
    return PerformanceMetrics.instance;
  }

  recordDuration(operation: string, durationMs: number) {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }

    const values = this.metrics.get(operation)!;
    values.push(durationMs);

    // Keep only last 1000 measurements
    if (values.length > 1000) {
      values.shift();
    }
  }

  getMetrics(operation: string) {
    const values = this.metrics.get(operation) || [];
    if (values.length === 0) {
      return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    return {
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  getAllMetrics() {
    const result: Record<string, any> = {};
    for (const [operation, _] of this.metrics) {
      result[operation] = this.getMetrics(operation);
    }
    return result;
  }
}

// Performance monitoring decorator
export function measurePerformance(operation: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const metrics = PerformanceMetrics.getInstance();

    descriptor.value = async function (...args: any[]) {
      const start = Date.now();
      try {
        const result = await originalMethod.apply(this, args);
        return result;
      } finally {
        const duration = Date.now() - start;
        metrics.recordDuration(operation, duration);
      }
    };

    return descriptor;
  };
}