import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import helmet from 'helmet';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import pino from 'pino';

const log = pino({ name: 'middleware' });

export interface RateLimitConfig {
  windowMs?: number;
  max?: number;
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  skipSuccessfulRequests?: boolean;
}

export interface SlowDownConfig {
  windowMs?: number;
  delayAfter?: number;
  delayMs?: number;
  maxDelayMs?: number;
  skipSuccessfulRequests?: boolean;
}

export function createRateLimiter(config?: RateLimitConfig): RequestHandler {
  return rateLimit({
    windowMs: config?.windowMs || 15 * 60 * 1000, // 15 minutes
    max: config?.max || 100, // Limit each IP to 100 requests per windowMs
    message: config?.message || 'Too many requests, please try again later.',
    standardHeaders: config?.standardHeaders ?? true,
    legacyHeaders: config?.legacyHeaders ?? false,
    skipSuccessfulRequests: config?.skipSuccessfulRequests ?? false,
    handler: (req: Request, res: Response) => {
      log.warn({
        ip: req.ip,
        path: req.path,
        method: req.method
      }, 'Rate limit exceeded');
      res.status(429).json({
        error: 'Too many requests',
        message: config?.message || 'Too many requests, please try again later.',
        retryAfter: res.getHeader('Retry-After')
      });
    }
  });
}

export function createWebhookRateLimiter(): RequestHandler {
  return createRateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 messages per minute per phone number
    message: 'Message rate limit exceeded. Please wait before sending more messages.',
    skipSuccessfulRequests: false
  });
}

export function createSlowDown(config?: SlowDownConfig): RequestHandler {
  return slowDown({
    windowMs: config?.windowMs || 15 * 60 * 1000, // 15 minutes
    delayAfter: config?.delayAfter || 50, // Allow 50 requests per windowMs without slowing
    delayMs: config?.delayMs || 500, // Add 500ms delay per request after delayAfter
    maxDelayMs: config?.maxDelayMs || 20000, // Maximum delay of 20 seconds
    skipSuccessfulRequests: config?.skipSuccessfulRequests ?? false
  });
}

export function createSecurityHeaders(): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    dnsPrefetchControl: true,
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: false,
    referrerPolicy: { policy: "no-referrer" },
    xssFilter: true,
  });
}

export function createHealthCheck(
  checks?: {
    database?: () => Promise<boolean>;
    redis?: () => Promise<boolean>;
    external?: () => Promise<boolean>;
  }
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.path !== '/health' && req.path !== '/healthz') {
      return next();
    }

    const health: any = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };

    if (checks) {
      const checkPromises = [];

      if (checks.database) {
        checkPromises.push(
          checks.database()
            .then(ok => ({ database: ok ? 'healthy' : 'unhealthy' }))
            .catch(() => ({ database: 'error' }))
        );
      }

      if (checks.redis) {
        checkPromises.push(
          checks.redis()
            .then(ok => ({ redis: ok ? 'healthy' : 'unhealthy' }))
            .catch(() => ({ redis: 'error' }))
        );
      }

      if (checks.external) {
        checkPromises.push(
          checks.external()
            .then(ok => ({ external: ok ? 'healthy' : 'unhealthy' }))
            .catch(() => ({ external: 'error' }))
        );
      }

      const results = await Promise.all(checkPromises);
      health.checks = Object.assign({}, ...results);

      const hasUnhealthy = Object.values(health.checks).some(
        status => status !== 'healthy'
      );

      if (hasUnhealthy) {
        health.status = 'degraded';
      }
    }

    res.status(health.status === 'ok' ? 200 : 503).json(health);
  };
}

export function createRequestLogger(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;

      log.info({
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        referer: req.get('referer'),
        contentLength: res.get('content-length'),
      }, 'Request completed');
    });

    next();
  };
}

export function createErrorHandler(): (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => void {
  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    log.error({
      err,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
    }, 'Unhandled error');

    if (res.headersSent) {
      return next(err);
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
  };
}

export function createAuditLogger(
  auditLog: (event: any) => Promise<void>
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const isCommand = req.body?.Body?.startsWith('/');

    if (isCommand) {
      const event = {
        type: 'command',
        command: req.body.Body,
        from: req.body.From,
        timestamp: new Date().toISOString(),
        ip: req.ip,
        userAgent: req.get('user-agent'),
      };

      try {
        await auditLog(event);
      } catch (error) {
        log.error({ error, event }, 'Failed to write audit log');
      }
    }

    next();
  };
}

export const middleware = {
  rateLimiter: createRateLimiter,
  webhookRateLimiter: createWebhookRateLimiter,
  slowDown: createSlowDown,
  securityHeaders: createSecurityHeaders,
  healthCheck: createHealthCheck,
  requestLogger: createRequestLogger,
  errorHandler: createErrorHandler,
  auditLogger: createAuditLogger,
};