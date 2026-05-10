import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { Quote, PriceUpdateEvent } from '@findash/shared';

/**
 * MarketDataService — ingests price feed from Kafka, caches in Redis, broadcasts via WS.
 *
 * Kafka topic: findash.price-updates
 * Message schema: { symbol: string, priceCents: number, prevCloseCents: number, volume: number }
 * Redis TTL: 5 seconds per quote key
 */
@Injectable()
export class MarketDataService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketDataService.name);
  private kafka: Kafka;
  private consumer: Consumer;

  /** Injected after gateway init to avoid circular dep */
  onPriceUpdate?: (event: PriceUpdateEvent) => void;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.kafka = new Kafka({
      clientId: 'findash-api',
      brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    });
    this.consumer = this.kafka.consumer({
      groupId: process.env.KAFKA_GROUP_ID ?? 'findash-api',
    });
  }

  async onModuleInit() {
    try {
      await this.consumer.connect();
      await this.consumer.subscribe({
        topic: process.env.KAFKA_TOPIC_PRICE_UPDATES ?? 'findash.price-updates',
        fromBeginning: false,
      });
      await this.consumer.run({
        eachMessage: (payload) => this.handleKafkaMessage(payload),
      });
      this.logger.log('Kafka consumer running — subscribed to price-updates');
    } catch (err) {
      this.logger.warn('Kafka unavailable — market data will use Redis cache only', err);
    }
  }

  async onModuleDestroy() {
    try {
      await this.consumer.disconnect();
    } catch {}
  }

  /**
   * Get the latest quote for a symbol.
   * Tries Redis cache first, then falls back to last DB snapshot.
   */
  async getQuote(symbol: string): Promise<Quote | null> {
    const cached = await this.redis.getQuote(symbol.toUpperCase());
    if (cached) {
      try {
        return JSON.parse(cached) as Quote;
      } catch {
        this.logger.warn(`Corrupt cached quote for ${symbol}`);
      }
    }

    const snapshot = await this.prisma.priceSnapshot.findFirst({
      where: { symbol: symbol.toUpperCase() },
      orderBy: { capturedAt: 'desc' },
    });

    if (!snapshot) return null;

    return {
      symbol: snapshot.symbol,
      lastPriceCents: snapshot.priceCents,
      prevCloseCents: snapshot.prevCloseCents,
      changeCents: snapshot.priceCents - snapshot.prevCloseCents,
      changeBps: Math.round(
        ((snapshot.priceCents - snapshot.prevCloseCents) / snapshot.prevCloseCents) * 10000,
      ),
      bidCents: snapshot.priceCents,
      askCents: snapshot.priceCents,
      volume: 0,
      timestamp: snapshot.capturedAt,
    };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async handleKafkaMessage({ message }: EachMessagePayload) {
    if (!message.value) return;

    try {
      const payload = JSON.parse(message.value.toString()) as {
        symbol: string;
        priceCents: number;
        prevCloseCents: number;
        volume?: number;
      };

      const symbol = payload.symbol.toUpperCase();
      const quote: Quote = {
        symbol,
        lastPriceCents: payload.priceCents,
        prevCloseCents: payload.prevCloseCents,
        changeCents: payload.priceCents - payload.prevCloseCents,
        changeBps: Math.round(
          ((payload.priceCents - payload.prevCloseCents) / payload.prevCloseCents) * 10000,
        ),
        bidCents: payload.priceCents,
        askCents: payload.priceCents,
        volume: payload.volume ?? 0,
        timestamp: new Date(),
      };

      // Cache in Redis (5s TTL)
      await this.redis.setQuote(symbol, JSON.stringify(quote));

      // Persist snapshot for fallback
      await this.prisma.priceSnapshot.create({
        data: {
          symbol,
          priceCents: quote.lastPriceCents,
          prevCloseCents: quote.prevCloseCents,
        },
      });

      // Broadcast to WebSocket clients
      this.onPriceUpdate?.({ symbol, quote });
    } catch (err) {
      this.logger.error('Failed to process Kafka price message', err);
    }
  }
}
