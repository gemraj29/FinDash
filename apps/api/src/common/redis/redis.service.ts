import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * RedisService — ioredis wrapper for price caching and pub/sub.
 * Price keys: findash:price:<SYMBOL> → JSON Quote, TTL 5s
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.client.on('error', (err) => this.logger.error('Redis error', err));
    this.client.on('connect', () => this.logger.log('Redis connected'));
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  /** Cache a price quote with 5-second TTL */
  async setQuote(symbol: string, quoteJson: string): Promise<void> {
    await this.client.set(`findash:price:${symbol}`, quoteJson, 'EX', 5);
  }

  /** Retrieve a cached price quote */
  async getQuote(symbol: string): Promise<string | null> {
    return this.client.get(`findash:price:${symbol}`);
  }

  /** Delete a cached quote */
  async deleteQuote(symbol: string): Promise<void> {
    await this.client.del(`findash:price:${symbol}`);
  }
}
