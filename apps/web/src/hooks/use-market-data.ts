'use client';
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Quote, PriceUpdateEvent } from '@findash/shared';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';

/**
 * useMarketData — subscribes to real-time price updates via Socket.io.
 * Maintains a map of symbol → latest Quote.
 */
export function useMarketData(portfolioId: string | null, symbols: string[]) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!portfolioId || symbols.length === 0) return;

    const socket = io(`${WS_URL}/market`, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('subscribe', { portfolioId, symbols });
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('price:update', (event: PriceUpdateEvent) => {
      setQuotes((prev) => ({ ...prev, [event.symbol]: event.quote }));
    });

    return () => {
      socket.emit('unsubscribe', { symbols });
      socket.disconnect();
    };
  }, [portfolioId, symbols.join(',')]);

  return { quotes, connected };
}
