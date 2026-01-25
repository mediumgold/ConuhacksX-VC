import { io, Socket } from 'socket.io-client';
import type {
  ClientJoinPayload,
  PlayerReadyPayload,
  PitchDataPayload,
  HostStartGamePayload,
  LobbyState,
  PlayerSlot,
  SongConfig,
  GameState
} from '../types';

const SOCKET_URL = 'http://localhost:3001';

class SocketClient {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private serverUrl = this.getServerUrl();

  private getServerUrl(): string {
    // If we're accessing via ngrok, construct the server URL
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const protocol = window.location.protocol;

      // Check if we're on ngrok
      if (hostname.includes('ngrok')) {
        // Use the same ngrok URL - Vite proxies /socket.io to port 3001
        console.log('[SocketClient] Using ngrok URL:', `${protocol}//${hostname}`);
        return `${protocol}//${hostname}`;
      }

      // Local development - use relative URL so Vite proxy handles it
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        console.log('[SocketClient] Using localhost with Vite proxy');
        return window.location.origin; // Use same origin, Vite will proxy
      }

      // Same network (using IP address) - use Vite proxy
      console.log('[SocketClient] Using network IP with Vite proxy');
      return window.location.origin;
    }

    return 'http://localhost:3001';
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      this.socket = io(this.serverUrl, {
        transports: ['websocket', 'polling']
      });

      this.socket.on('connect', () => {
        console.log('[Socket] Connected to server');
        resolve();
      });

      this.socket.on('connect_error', (err) => {
        console.error('[Socket] Connection error:', err);
        reject(err);
      });

      this.socket.on('disconnect', () => {
        console.log('[Socket] Disconnected from server');
        this.emit('disconnected', {});
      });

      // Forward all game events to listeners
      const events = [
        'joined',
        'player_assigned',
        'lobby_update',
        'all_ready',
        'game_start',
        'pitch_update',
        'game_state',
        'game_over',
        'error'
      ];

      events.forEach(event => {
        this.socket!.on(event, (data: any) => {
          this.emit(event, data);
        });
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Join as host or player
  joinAsHost() {
    this.socket?.emit('join', { type: 'host' } as ClientJoinPayload);
  }

  joinAsPlayer(requestedSlot?: PlayerSlot) {
    this.socket?.emit('join', { type: 'player', requestedSlot } as ClientJoinPayload);
  }

  // Player ready
  setReady(slot: PlayerSlot) {
    this.socket?.emit('player_ready', { slot } as PlayerReadyPayload);
  }

  // Start game (host only)
  startGame(songConfig: SongConfig) {
    this.socket?.emit('start_game', { songConfig } as HostStartGamePayload);
  }

  // Send pitch data (player only)
  sendPitchData(slot: PlayerSlot, pitch: number, timestamp: number, volume: number) {
    this.socket?.emit('pitch_data', { slot, pitch, timestamp, volume } as PitchDataPayload);
  }

  // Send game state update (host only)
  sendGameStateUpdate(gameState: GameState) {
    this.socket?.emit('game_state_update', gameState);
  }

  // Send game over (host only)
  sendGameOver(winner: PlayerSlot | 'tie', player1Score: number, player2Score: number) {
    this.socket?.emit('game_over', { winner, player1Score, player2Score });
  }

  // Event subscription
  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function) {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }
}

export const socketClient = new SocketClient();
