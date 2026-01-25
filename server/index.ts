import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import type {
  LobbyState,
  PlayerSlot,
  ClientJoinPayload,
  PlayerReadyPayload,
  PitchDataPayload,
  HostStartGamePayload,
  SongConfig
} from '../types';

const app = express();
const httpServer = createServer(app);

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

const io = new Server(httpServer, {
  cors: {
    origin: true, // Allow all origins for ngrok compatibility
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Serve MIDI files statically
const midiFilesPath = join(process.cwd(), 'Midi Files');
console.log('[Server] MIDI files path:', midiFilesPath);
app.use('/midi', express.static(midiFilesPath));
app.use('/midi', (req, res, next) => {
  console.log('[Server] MIDI file request:', req.url);
  next();
});

// API endpoint to list available MIDI files
app.get('/api/midi-files', async (req, res) => {
  try {
    console.log('[API] /api/midi-files - Reading from:', midiFilesPath);
    const files = await readdir(midiFilesPath);
    const midiFiles = files.filter(f => f.toLowerCase().endsWith('.mid') || f.toLowerCase().endsWith('.midi'));
    console.log('[API] /api/midi-files - Found:', midiFiles);
    res.json({ files: midiFiles });
  } catch (error) {
    console.error('[API] /api/midi-files - Error:', error);
    res.json({ files: [] });
  }
});

// API endpoint to get YouTube links from links.txt
app.get('/api/youtube-links', async (req, res) => {
  try {
    const linksPath = join(process.cwd(), 'links.txt');
    console.log('[API] /api/youtube-links - Reading from:', linksPath);
    const content = await readFile(linksPath, 'utf-8');
    console.log('[API] /api/youtube-links - Content:', content);
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    
    // Parse format: [Song Name - Artist]https://youtube.com/...
    const links = lines.map(line => {
      const match = line.match(/^\[([^\]]+)\](.+)$/);
      if (match) {
        return {
          name: match[1].trim(),
          url: match[2].trim()
        };
      }
      return null;
    }).filter(Boolean);
    
    console.log('[API] /api/youtube-links - Parsed links:', links);
    res.json({ links });
  } catch (error) {
    console.error('[API] /api/youtube-links - Error:', error);
    res.json({ links: [] });
  }
});

// Serve Lyrics folder statically
const lyricsPath = join(process.cwd(), 'Lyrics');
app.use('/lyrics', express.static(lyricsPath));

// API endpoint to list available lyrics files
app.get('/api/lyrics-files', async (req, res) => {
  try {
    console.log('[API] /api/lyrics-files - Reading from:', lyricsPath);
    const files = await readdir(lyricsPath);
    const lyricsFiles = files.filter(f => f.toLowerCase().endsWith('.txt'));
    console.log('[API] /api/lyrics-files - Found:', lyricsFiles);
    res.json({ files: lyricsFiles });
  } catch (error) {
    console.error('[API] /api/lyrics-files - Error:', error);
    res.json({ files: [] });
  }
});

// API endpoint to get lyrics file content
app.get('/api/lyrics-file/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = join(lyricsPath, filename);
    console.log('[API] /api/lyrics-file - Filename:', filename);
    console.log('[API] /api/lyrics-file - Full path:', filePath);
    const content = await readFile(filePath, 'utf-8');
    console.log('[API] /api/lyrics-file - Content length:', content.length);
    res.json({ content });
  } catch (error) {
    console.error('[API] /api/lyrics-file - Error:', error);
    res.status(404).json({ error: 'File not found' });
  }
});

// API endpoint to fetch lyrics from lrclib.net (proxy to avoid CORS)
app.get('/api/lyrics/search', async (req, res) => {
  try {
    const { title, artist } = req.query;

    if (!title) {
      res.status(400).json({ error: 'Title parameter is required' });
      return;
    }

    const params = new URLSearchParams({ track_name: title as string });
    if (artist) {
      params.append('artist_name', artist as string);
    }

    const response = await fetch(`https://lrclib.net/api/search?${params.toString()}`);

    if (!response.ok) {
      console.error('LRCLib API error:', response.status);
      res.status(response.status).json({ error: 'Failed to fetch from lrclib.net' });
      return;
    }

    const results = await response.json();
    res.json(results);
  } catch (error) {
    console.error('Failed to fetch lyrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ SESSION STATE ============
interface SessionState {
  hostSocketId: string | null;
  player1SocketId: string | null;
  player2SocketId: string | null;
  p1Ready: boolean;
  p2Ready: boolean;
  gameInProgress: boolean;
  songConfig: SongConfig | null;
  gameStartTimestamp: number | null;
}

const session: SessionState = {
  hostSocketId: null,
  player1SocketId: null,
  player2SocketId: null,
  p1Ready: false,
  p2Ready: false,
  gameInProgress: false,
  songConfig: null,
  gameStartTimestamp: null
};

function getLobbyState(): LobbyState {
  return {
    p1Connected: session.player1SocketId !== null,
    p2Connected: session.player2SocketId !== null,
    p1Ready: session.p1Ready,
    p2Ready: session.p2Ready,
    hostConnected: session.hostSocketId !== null
  };
}

function broadcastLobbyState() {
  io.emit('lobby_update', getLobbyState());
}

function resetSession() {
  session.p1Ready = false;
  session.p2Ready = false;
  session.gameInProgress = false;
  session.songConfig = null;
  session.gameStartTimestamp = null;
}

// ============ SOCKET HANDLERS ============
io.on('connection', (socket: Socket) => {
  console.log(`[Server] Client connected: ${socket.id}`);

  // Handle join request
  socket.on('join', (payload: ClientJoinPayload) => {
    console.log(`[Server] Join request:`, payload);

    if (payload.type === 'host') {
      if (session.hostSocketId && session.hostSocketId !== socket.id) {
        socket.emit('error', { message: 'Host already connected' });
        return;
      }
      session.hostSocketId = socket.id;
      socket.emit('joined', { role: 'host' });
      console.log(`[Server] Host connected: ${socket.id}`);
    } else {
      // Player joining
      let assignedSlot: PlayerSlot | null = null;

      if (payload.requestedSlot === 1 && !session.player1SocketId) {
        session.player1SocketId = socket.id;
        assignedSlot = 1;
      } else if (payload.requestedSlot === 2 && !session.player2SocketId) {
        session.player2SocketId = socket.id;
        assignedSlot = 2;
      } else if (!session.player1SocketId) {
        session.player1SocketId = socket.id;
        assignedSlot = 1;
      } else if (!session.player2SocketId) {
        session.player2SocketId = socket.id;
        assignedSlot = 2;
      }

      if (assignedSlot) {
        socket.emit('player_assigned', { slot: assignedSlot });
        console.log(`[Server] Player ${assignedSlot} connected: ${socket.id}`);
      } else {
        socket.emit('error', { message: 'Game is full' });
        return;
      }
    }

    broadcastLobbyState();
  });

  // Handle player ready
  socket.on('player_ready', (payload: PlayerReadyPayload) => {
    console.log(`[Server] Player ${payload.slot} ready`);
    
    if (payload.slot === 1 && session.player1SocketId === socket.id) {
      session.p1Ready = true;
    } else if (payload.slot === 2 && session.player2SocketId === socket.id) {
      session.p2Ready = true;
    }

    broadcastLobbyState();

    // Check if both ready
    if (session.p1Ready && session.p2Ready && session.hostSocketId) {
      io.to(session.hostSocketId).emit('all_ready');
      console.log(`[Server] All players ready, notifying host`);
    }
  });

  // Handle game start from host
  socket.on('start_game', (payload: HostStartGamePayload) => {
    console.log(`[Server] Received start_game from socket ${socket.id}`);
    console.log(`[Server] Session state: hostSocketId=${session.hostSocketId}, p1Ready=${session.p1Ready}, p2Ready=${session.p2Ready}`);
    
    if (socket.id !== session.hostSocketId) {
      console.log(`[Server] ❌ Rejected: socket ${socket.id} is not host ${session.hostSocketId}`);
      socket.emit('error', { message: 'Only host can start game' });
      return;
    }

    // Allow starting even without ready for testing - just log warning
    if (!session.p1Ready || !session.p2Ready) {
      console.log(`[Server] ⚠️ Warning: Starting game without all players ready (P1: ${session.p1Ready}, P2: ${session.p2Ready})`);
      // Don't block - allow for testing
    }

    session.gameInProgress = true;
    session.songConfig = payload.songConfig;
    session.gameStartTimestamp = Date.now();

    // Broadcast game start to all clients
    io.emit('game_start', {
      startTimestamp: session.gameStartTimestamp,
      songConfig: payload.songConfig
    });

    console.log(`[Server] ✅ Game started at ${session.gameStartTimestamp}`);
    console.log(`[Server] ✅ Broadcasting game_start to ALL connected sockets`);
    console.log(`[Server] Connected clients - P1: ${session.player1SocketId}, P2: ${session.player2SocketId}, Host: ${session.hostSocketId}`);
  });

  // Handle pitch data from clients
  socket.on('pitch_data', (payload: PitchDataPayload) => {
    if (!session.gameInProgress) return;

    // Relay pitch data to host
    if (session.hostSocketId) {
      io.to(session.hostSocketId).emit('pitch_update', {
        slot: payload.slot,
        pitch: payload.pitch,
        timestamp: payload.timestamp,
        volume: payload.volume
      });
    }
  });

  // Handle game state updates from host (broadcast to clients for sync)
  socket.on('game_state_update', (gameState: any) => {
    if (socket.id !== session.hostSocketId) return;
    
    // Broadcast to player clients for optional sync display
    if (session.player1SocketId) {
      io.to(session.player1SocketId).emit('game_state', gameState);
    }
    if (session.player2SocketId) {
      io.to(session.player2SocketId).emit('game_state', gameState);
    }
  });

  // Handle game over
  socket.on('game_over', (payload: any) => {
    if (socket.id !== session.hostSocketId) return;
    
    io.emit('game_over', payload);
    resetSession();
    broadcastLobbyState();
    console.log(`[Server] Game over. Winner: ${payload.winner}`);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`[Server] Client disconnected: ${socket.id}`);

    if (socket.id === session.hostSocketId) {
      session.hostSocketId = null;
      // If host disconnects during game, end it
      if (session.gameInProgress) {
        io.emit('game_over', { winner: 'tie', reason: 'Host disconnected' });
        resetSession();
      }
    } else if (socket.id === session.player1SocketId) {
      session.player1SocketId = null;
      session.p1Ready = false;
      if (session.gameInProgress) {
        io.emit('game_over', { winner: 2, reason: 'Player 1 disconnected' });
        resetSession();
      }
    } else if (socket.id === session.player2SocketId) {
      session.player2SocketId = null;
      session.p2Ready = false;
      if (session.gameInProgress) {
        io.emit('game_over', { winner: 1, reason: 'Player 2 disconnected' });
        resetSession();
      }
    }

    broadcastLobbyState();
  });
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  VOCAL COMBAT MULTIPLAYER SERVER`);
  console.log(`========================================`);
  console.log(`  Server running on port ${PORT}`);
  console.log(`  `);
  console.log(`  Host UI:    http://localhost:3000/host`);
  console.log(`  Player 1:   http://localhost:3000/client?p=1`);
  console.log(`  Player 2:   http://localhost:3000/client?p=2`);
  console.log(`========================================\n`);
});
