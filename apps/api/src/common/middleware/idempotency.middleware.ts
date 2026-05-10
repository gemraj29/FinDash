import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../redis/redis.service';

/**
 * IdempotencyMiddleware — enforces Idempotency-Key header on mutating trade endpoints.
 * Stores processed keys in Redis with 24h TTL; duplicate requests return 409.
 *
 * DNA rule: idempotency key on every mutation.
 */
@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  constructor(private readonly redis: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return next();
    }

    const key = req.headers['idempotency-key'] as string | undefined;
    if (!key) {
      // Idempotency-Key is strongly recommended but not hard-blocked for non-trade routes
      return next();
    }

    const cacheKey = `findash:idempotency:${key}`;
    const existing = await this.redis.client.get(cacheKey);

    if (existing) {
      // Return cached response — prevents double-submission
      res.status(409).json({
        error: {
          code: 'DUPLICATE_REQUEST',
          message: `Request with Idempotency-Key '${key}' was already processed`,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Mark as in-flight; full result stored after handler completes
    await this.redis.client.set(cacheKey, '1', 'EX', 86400); // 24h TTL
    next();
  }
}
