import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { MarketDataService } from './market-data.service';
import { SubscribeRequest, PriceUpdateEvent } from '@findash/shared';

/**
 * MarketDataGateway — WebSocket gateway for real-time price streaming.
 * Clients subscribe to a portfolio's symbols; server pushes price:update events.
 *
 * Events emitted to clients:
 *   price:update  { symbol, quote }
 *   price:error   { symbol, message }
 */
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/market' })
export class MarketDataGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(MarketDataGateway.name);

  /** Map of clientId → subscribed symbols */
  private subscriptions = new Map<string, Set<string>>();

  constructor(private readonly marketDataService: MarketDataService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.subscriptions.set(client.id, new Set());
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.subscriptions.delete(client.id);
  }

  /** Client subscribes to price updates for a list of symbols */
  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @MessageBody() req: SubscribeRequest,
    @ConnectedSocket() client: Socket,
  ) {
    const symbols = this.subscriptions.get(client.id) ?? new Set<string>();

    for (const symbol of req.symbols) {
      symbols.add(symbol.toUpperCase());
    }

    this.subscriptions.set(client.id, symbols);
    client.join(req.portfolioId); // room per portfolio

    // Send immediate snapshots for newly subscribed symbols
    for (const symbol of req.symbols) {
      const quote = await this.marketDataService.getQuote(symbol);
      if (quote) {
        client.emit('price:update', { symbol, quote } as PriceUpdateEvent);
      }
    }

    return { subscribed: Array.from(symbols) };
  }

  /** Client unsubscribes from price updates */
  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @MessageBody() req: { symbols: string[] },
    @ConnectedSocket() client: Socket,
  ) {
    const symbols = this.subscriptions.get(client.id) ?? new Set<string>();
    for (const s of req.symbols) {
      symbols.delete(s.toUpperCase());
    }
    this.subscriptions.set(client.id, symbols);
    return { unsubscribed: req.symbols };
  }

  /**
   * Broadcast a price update to all subscribed clients.
   * Called by MarketDataService when a new Kafka price event arrives.
   */
  broadcastPriceUpdate(event: PriceUpdateEvent) {
    this.server.emit('price:update', event);
  }
}
