import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { RealtimeEvent } from '../lib/types';

/**
 * Absolute URL of the realtime endpoint.
 *
 * Resolution order:
 *   1. `VITE_WS_URL` when set (explicit split deployment).
 *   2. Derived from `VITE_API_URL` — required in development, where the API and
 *      the client run on different ports. The path must stay `/api/realtime`,
 *      because the API registers every route under the `/api` prefix.
 *   3. Same-origin `/api/realtime` when `VITE_API_URL` is empty, which is what a
 *      single-origin deployment behind nginx/reverse proxy wants.
 */
function resolveSocketUrl(): string {
  const explicit = import.meta.env['VITE_WS_URL'] as string | undefined;
  if (explicit) return explicit;

  const apiBase = import.meta.env['VITE_API_URL'] as string | undefined;
  if (apiBase) {
    return `${apiBase.replace(/^http/, 'ws').replace(/\/$/, '')}/api/realtime`;
  }

  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}/api/realtime`;
}

const WS_URL = resolveSocketUrl();

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'reconnecting';

type Listener = (event: RealtimeEvent) => void;

interface RealtimeContextValue {
  status: ConnectionStatus;
  /** Subscribe to every event for the active workspace. Returns an unsubscribe. */
  subscribe: (listener: Listener) => () => void;
  /** Presence snapshot pushed by the server. */
  presence: { userId: string; name: string; connections: number }[];
  /** Last event received, useful for debugging/diagnostics. */
  lastEvent: RealtimeEvent | null;
  reconnectAttempts: number;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/**
 * Single WebSocket per tab, shared by every page through context.
 *
 * Reconnects with exponential backoff + jitter, re-subscribes to the active
 * workspace after a reconnect, and keeps a heartbeat so half-open connections
 * are detected. If the socket cannot be established at all the app keeps
 * working — realtime is an enhancement, never a dependency.
 */
export function RealtimeProvider({
  workspaceId,
  enabled = true,
  children,
}: {
  workspaceId: string | null;
  enabled?: boolean;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [presence, setPresence] = useState<RealtimeContextValue['presence']>([]);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef(new Set<Listener>());
  const workspaceRef = useRef<string | null>(workspaceId);
  const attemptsRef = useRef(0);
  const reconnectTimer = useRef<number | null>(null);
  const heartbeat = useRef<number | null>(null);
  const closedByUs = useRef(false);

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    workspaceRef.current = workspaceId;
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN && workspaceId) {
      socket.send(JSON.stringify({ type: 'subscribe', workspaceId }));
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!enabled) {
      setStatus('closed');
      return;
    }

    closedByUs.current = false;

    const connect = () => {
      try {
        // NOTE: do not round-trip this through `new URL()`. WHATWG URL parsing
        // only understands special schemes (http/https/ws/wss) when they carry
        // `//`, so a `ws://host/api/realtime` literal would survive but any
        // re-serialization risks dropping the host. Building the query string
        // manually keeps the full path intact.
        const socketUrl = workspaceRef.current
          ? `${WS_URL}${WS_URL.includes('?') ? '&' : '?'}workspaceId=${encodeURIComponent(workspaceRef.current)}`
          : WS_URL;
        const socket = new WebSocket(socketUrl);
        socketRef.current = socket;
        setStatus(attemptsRef.current === 0 ? 'connecting' : 'reconnecting');

        socket.onopen = () => {
          attemptsRef.current = 0;
          setReconnectAttempts(0);
          setStatus('open');
          if (workspaceRef.current) {
            socket.send(JSON.stringify({ type: 'subscribe', workspaceId: workspaceRef.current }));
          }
          if (heartbeat.current) window.clearInterval(heartbeat.current);
          heartbeat.current = window.setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'ping' }));
            }
          }, 25_000);
        };

        socket.onmessage = (message) => {
          let event: RealtimeEvent;
          try {
            event = JSON.parse(String(message.data)) as RealtimeEvent;
          } catch {
            return;
          }
          if (event.type === 'hello') {
            const payload = event.payload as { presence?: RealtimeContextValue['presence'] };
            if (payload?.presence) setPresence(payload.presence);
            return;
          }
          if (event.type === 'pong') return;
          if (event.type === 'presence.sync') {
            const payload = event.payload as { presence?: RealtimeContextValue['presence'] };
            if (payload?.presence) setPresence(payload.presence);
          }
          setLastEvent(event);
          for (const listener of listenersRef.current) {
            try {
              listener(event);
            } catch (error) {
              console.error('realtime listener failed', error);
            }
          }
        };

        socket.onclose = () => {
          if (heartbeat.current) window.clearInterval(heartbeat.current);
          if (closedByUs.current) {
            setStatus('closed');
            return;
          }
          attemptsRef.current += 1;
          setReconnectAttempts(attemptsRef.current);
          setStatus('reconnecting');
          const delay =
            Math.min(1000 * 2 ** (attemptsRef.current - 1), 15_000) + Math.random() * 400;
          reconnectTimer.current = window.setTimeout(connect, delay);
        };

        socket.onerror = () => {
          // `onclose` always follows; reconnection is handled there.
        };
      } catch {
        setStatus('closed');
      }
    };

    connect();

    return () => {
      closedByUs.current = true;
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      if (heartbeat.current) window.clearInterval(heartbeat.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [enabled]);

  const value = useMemo<RealtimeContextValue>(
    () => ({ status, subscribe, presence, lastEvent, reconnectAttempts }),
    [status, subscribe, presence, lastEvent, reconnectAttempts],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  if (!context) throw new Error('useRealtime must be used inside <RealtimeProvider>');
  return context;
}

/** Convenience hook: run a handler for specific event types. */
export function useRealtimeEvent(
  types: string | string[],
  handler: (event: RealtimeEvent) => void,
): void {
  const { subscribe } = useRealtime();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const key = Array.isArray(types) ? types.join('|') : types;

  useEffect(() => {
    const allowed = new Set(key.split('|'));
    return subscribe((event) => {
      if (allowed.has(event.type) || allowed.has('*')) handlerRef.current(event);
    });
  }, [subscribe, key]);
}
