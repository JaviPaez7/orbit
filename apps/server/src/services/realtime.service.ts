import type { RealtimeEvent } from '../types.js';

interface ClientMeta {
  id: string;
  userId: string;
  userName: string;
  workspaceIds: Set<string>;
  /** The workspace currently open in that tab, used for presence counts. */
  activeWorkspaceId: string;
  sockets: Set<WebSocket>;
  connectedAt: number;
}

export interface MinimalSocket {
  send: (data: string) => void;
  close: () => void;
  readyState: number;
}

const OPEN = 1;

/**
 * In-process realtime hub.
 *
 * Tracks one entry per connected tab, fans events out to every member of the
 * target workspace (including the sender, so all of their tabs converge), and
 * exposes presence so the UI can show who else is around.
 *
 * Swapping this for Redis pub/sub only requires replacing `broadcast()` — the
 * rest of the server talks to the hub through this class.
 */
export class RealtimeHub {
  private readonly clients = new Map<string, ClientMeta>();
  private seq = 0;

  register(input: {
    userId: string;
    userName: string;
    workspaceIds: string[];
    activeWorkspaceId: string;
    socket: MinimalSocket;
  }): ClientMeta {
    const meta: ClientMeta = {
      id: `${input.userId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
      userId: input.userId,
      userName: input.userName,
      workspaceIds: new Set(input.workspaceIds),
      activeWorkspaceId: input.activeWorkspaceId,
      sockets: new Set(),
      connectedAt: Date.now(),
    };
    // A user may have many tabs open; key the entry by user + generated id.
    meta.sockets.add(input.socket as unknown as WebSocket);
    this.clients.set(meta.id, meta);
    return meta;
  }

  unregister(clientId: string, socket: MinimalSocket): void {
    const meta = this.clients.get(clientId);
    if (!meta) return;
    meta.sockets.delete(socket as unknown as WebSocket);
    if (meta.sockets.size === 0) this.clients.delete(clientId);
  }

  setActiveWorkspace(clientId: string, workspaceId: string): void {
    const meta = this.clients.get(clientId);
    if (meta) meta.activeWorkspaceId = workspaceId;
  }

  /** Adds a socket to an existing connection entry (same user, extra tab). */
  attach(clientId: string, socket: MinimalSocket): boolean {
    const meta = this.clients.get(clientId);
    if (!meta) return false;
    meta.sockets.add(socket as unknown as WebSocket);
    return true;
  }

  /** Broadcast to every tab of every member of a workspace. */
  broadcast(event: Omit<RealtimeEvent, 'seq' | 'at'> & { at?: string }): void {
    this.seq += 1;
    const envelope: RealtimeEvent = {
      ...event,
      seq: this.seq,
      at: event.at ?? new Date().toISOString(),
    };
    const payload = JSON.stringify(envelope);
    for (const meta of this.clients.values()) {
      if (!meta.workspaceIds.has(event.workspaceId)) continue;
      for (const socket of meta.sockets) {
        if (socket.readyState === OPEN) {
          try {
            socket.send(payload);
          } catch {
            // A dead socket is cleaned up by the close handler.
          }
        }
      }
    }
  }

  /** Send an event to a single user across all of their tabs. */
  sendToUser(userId: string, event: Omit<RealtimeEvent, 'seq' | 'at'> & { at?: string }): void {
    this.seq += 1;
    const payload = JSON.stringify({
      ...event,
      seq: this.seq,
      at: event.at ?? new Date().toISOString(),
    });
    for (const meta of this.clients.values()) {
      if (meta.userId !== userId) continue;
      for (const socket of meta.sockets) {
        if (socket.readyState === OPEN) {
          try {
            socket.send(payload);
          } catch {
            /* ignored */
          }
        }
      }
    }
  }

  presence(workspaceId: string): { userId: string; name: string; connections: number }[] {
    const map = new Map<string, { userId: string; name: string; connections: number }>();
    for (const meta of this.clients.values()) {
      if (meta.activeWorkspaceId !== workspaceId) continue;
      const entry = map.get(meta.userId) ?? {
        userId: meta.userId,
        name: meta.userName,
        connections: 0,
      };
      entry.connections += meta.sockets.size;
      map.set(meta.userId, entry);
    }
    return [...map.values()];
  }

  connectionCount(): number {
    let total = 0;
    for (const meta of this.clients.values()) total += meta.sockets.size;
    return total;
  }

  /** Revokes access after a membership change (e.g. removed from workspace). */
  revokeWorkspace(userId: string, workspaceId: string): void {
    for (const meta of this.clients.values()) {
      if (meta.userId === userId) meta.workspaceIds.delete(workspaceId);
    }
  }

  grantWorkspace(userId: string, workspaceId: string): void {
    for (const meta of this.clients.values()) {
      if (meta.userId === userId) meta.workspaceIds.add(workspaceId);
    }
  }

  closeUser(userId: string): void {
    for (const [id, meta] of this.clients.entries()) {
      if (meta.userId !== userId) continue;
      for (const socket of meta.sockets) {
        try {
          socket.close();
        } catch {
          /* ignored */
        }
      }
      this.clients.delete(id);
    }
  }
}

export const realtimeHub = new RealtimeHub();
