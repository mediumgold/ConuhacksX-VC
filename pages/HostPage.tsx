import React, { useState, useEffect, useRef, useCallback } from 'react';
import { socketClient } from '../services/socketClient';
import { parseLRC, getLyricAtTime } from '../services/lrcParser';
import { parseMidiFile, getNotesInWindow, getNoteAtTime } from '../services/midiParser';
import { 
  createInitialGameState, 
  processGameTick, 
  resetAnimationFlags,
  getCurrentSegment 
} from '../services/gameEngine';
import { GamePhase } from '../types';
import type { LobbyState, GameState, MidiNote, LrcLine, SongConfig } from '../types';
import Fighter from '../components/Fighter';
import KaraokeHighway from '../components/KaraokeHighway';
import NgrokSetup from './NgrokSetup';
import { Mic, Users, Play, Upload, Music, FileText, Wifi, WifiOff } from 'lucide-react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

const HostPage: React.FC = () => {
  // Connection state
  const [connected, setConnected] = useState(false);
  const [lobbyState, setLobbyState] = useState<LobbyState>({
    p1Connected: false,
    p2Connected: false,
    p1Ready: false,
    p2Ready: false,
    hostConnected: false
  });
  const [allReady, setAllReady] = useState(false);

  // Song setup
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeId, setYoutubeId] = useState('');
  const [lrcText, setLrcText] = useState('');
  const [midiFile, setMidiFile] = useState<File | null>(null);
  const [availableMidiFiles, setAvailableMidiFiles] = useState<string[]>([]);
  const [selectedMidiFile, setSelectedMidiFile] = useState('');
  
  // Parsed data
  const [lyrics, setLyrics] = useState<LrcLine[]>([]);
  const [midiNotes, setMidiNotes] = useState<MidiNote[]>([]);
  const [songDuration, setSongDuration] = useState(0);
  
  // Game state
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentLyric, setCurrentLyric] = useState('');
  
  // Player pitches (received from clients)
  const p1PitchRef = useRef(-1);
  const p2PitchRef = useRef(-1);
  
  // YouTube player
  const ytPlayerRef = useRef<any>(null);
  const ytReadyRef = useRef(false);
  const gameLoopRef = useRef<number | null>(null);
  const gameStartTimeRef = useRef<number>(0);

  // Connect to server on mount
  useEffect(() => {
    const connect = async () => {
      try {
        await socketClient.connect();
        socketClient.joinAsHost();
        setConnected(true);
      } catch (err) {
        console.error('Failed to connect:', err);
      }
    };

    connect();

    // Socket event handlers
    socketClient.on('lobby_update', (state: LobbyState) => {
      setLobbyState(state);
    });

    socketClient.on('all_ready', () => {
      setAllReady(true);
    });

    socketClient.on('pitch_update', (data: { slot: 1 | 2; pitch: number }) => {
      if (data.slot === 1) {
        p1PitchRef.current = data.pitch;
      } else {
        p2PitchRef.current = data.pitch;
      }
    });

    socketClient.on('disconnected', () => {
      setConnected(false);
    });

    // Fetch available MIDI files
    const fetchMidiFiles = async () => {
      try {
        // Get server URL from sessionStorage or use localhost
        let serverUrl = 'http://localhost:3001';
        const stored = sessionStorage.getItem('ngrok-config');
        if (stored) {
          const config = JSON.parse(stored);
          if (config.serverUrl) {
            serverUrl = config.serverUrl;
          }
        }
        const response = await fetch(`${serverUrl}/api/midi-files`);
        const data = await response.json();
        setAvailableMidiFiles(data.files || []);
      } catch (err) {
        console.error('Failed to fetch MIDI files:', err);
      }
    };

    fetchMidiFiles();

    return () => {
      socketClient.disconnect();
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, []);

  // Load YouTube IFrame API
  useEffect(() => {
    if (window.YT) return;
    
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.body.appendChild(tag);
  }, []);

  // Parse YouTube URL
  const parseYouTubeId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  // Load YouTube video
  const loadYouTube = () => {
    const id = parseYouTubeId(youtubeUrl);
    if (!id) {
      alert('Invalid YouTube URL');
      return;
    }
    setYoutubeId(id);

    if (ytPlayerRef.current) {
      ytPlayerRef.current.loadVideoById(id);
      return;
    }

    const initPlayer = () => {
      ytPlayerRef.current = new window.YT.Player('youtube-player', {
        height: '200',
        width: '100%',
        videoId: id,
        playerVars: { playsinline: 1 },
        events: {
          onReady: (event: any) => {
            ytReadyRef.current = true;
            const duration = event.target.getDuration();
            setSongDuration(duration);
          },
          onStateChange: (event: any) => {
            if (event.data === window.YT.PlayerState.ENDED) {
              // Song ended
              if (gameState?.phase === GamePhase.PLAYING) {
                endGame();
              }
            }
          }
        }
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
    }
  };

  // Load LRC lyrics
  const loadLyrics = () => {
    const parsed = parseLRC(lrcText);
    if (parsed.length === 0) {
      alert('No valid LRC lines found');
      return;
    }
    setLyrics(parsed);
  };

  // Load MIDI file from upload
  const handleMidiUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setMidiFile(file);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const notes = await parseMidiFile(arrayBuffer);
      setMidiNotes(notes);
      
      // Update duration from MIDI if longer
      if (notes.length > 0) {
        const lastNote = notes[notes.length - 1];
        const midiDuration = lastNote.time + lastNote.duration;
        if (midiDuration > songDuration) {
          setSongDuration(midiDuration);
        }
      }
    } catch (err) {
      console.error('Failed to parse MIDI:', err);
      alert('Failed to parse MIDI file');
    }
  };

  // Load MIDI file from server
  const handleMidiSelect = async (filename: string) => {
    if (!filename) return;
    
    setSelectedMidiFile(filename);
    
    try {
      // Get server URL from sessionStorage or use localhost
      let serverUrl = 'http://localhost:3001';
      const stored = sessionStorage.getItem('ngrok-config');
      if (stored) {
        const config = JSON.parse(stored);
        if (config.serverUrl) {
          serverUrl = config.serverUrl;
        }
      }
      const response = await fetch(`${serverUrl}/midi/${encodeURIComponent(filename)}`);
      const arrayBuffer = await response.arrayBuffer();
      const notes = await parseMidiFile(arrayBuffer);
      setMidiNotes(notes);
      
      // Update duration from MIDI if longer
      if (notes.length > 0) {
        const lastNote = notes[notes.length - 1];
        const midiDuration = lastNote.time + lastNote.duration;
        if (midiDuration > songDuration) {
          setSongDuration(midiDuration);
        }
      }
    } catch (err) {
      console.error('Failed to load MIDI:', err);
      alert('Failed to load MIDI file');
    }
  };

  // Start game
  const startGame = () => {
    if (!ytReadyRef.current || midiNotes.length === 0) {
      alert('Please load YouTube video and MIDI file first');
      return;
    }

    const songConfig: SongConfig = {
      title: 'Song',
      artist: 'Artist',
      youtubeId,
      duration: songDuration,
      midiNotes,
      lyrics
    };

    // Initialize game state
    const initialState = createInitialGameState(songDuration);
    initialState.phase = GamePhase.PLAYING;
    setGameState(initialState);

    // Notify clients
    socketClient.startGame(songConfig);

    // Start YouTube playback
    ytPlayerRef.current.playVideo();
    gameStartTimeRef.current = performance.now();

    // Start game loop
    gameLoop();
  };

  // Game loop
  const gameLoop = useCallback(() => {
    if (!ytPlayerRef.current || !ytReadyRef.current) {
      gameLoopRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    const currentTime = ytPlayerRef.current.getCurrentTime() || 0;

    setGameState(prevState => {
      if (!prevState || prevState.phase !== GamePhase.PLAYING) {
        return prevState;
      }

      // Process tick
      const { gameState: newState } = processGameTick(
        prevState,
        midiNotes,
        p1PitchRef.current,
        p2PitchRef.current,
        currentTime
      );

      // Update current lyric
      const lyric = getLyricAtTime(lyrics, currentTime);
      setCurrentLyric(lyric?.text || '');

      // Broadcast state to clients
      socketClient.sendGameStateUpdate(newState);

      // Check for game over
      if (newState.phase === GamePhase.GAME_OVER) {
        endGame(newState);
        return newState;
      }

      // Reset animation flags after short delay
      setTimeout(() => {
        setGameState(s => s ? resetAnimationFlags(s) : s);
      }, 200);

      return newState;
    });

    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [midiNotes, lyrics]);

  // End game
  const endGame = (finalState?: GameState) => {
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
    }
    
    if (ytPlayerRef.current) {
      ytPlayerRef.current.pauseVideo();
    }

    if (finalState) {
      socketClient.sendGameOver(
        finalState.winner || 'tie',
        finalState.player1.score,
        finalState.player2.score
      );
    }
  };

  // Check if ready to start
  const canStart = connected && 
    lobbyState.p1Connected && 
    lobbyState.p2Connected && 
    allReady && 
    youtubeId && 
    midiNotes.length > 0;

  // Render lobby
  if (!gameState || gameState.phase === GamePhase.LOBBY) {
    return (
      <div className="min-h-screen h-full bg-black text-white overflow-y-auto">
        <div className="max-w-4xl mx-auto p-4 md:p-8 pb-20">
          <h1 className="text-2xl md:text-4xl font-black text-cyan-500 mb-2">VOCAL COMBAT</h1>
          <p className="text-yellow-500 mb-4 md:mb-8 text-sm md:text-base">HOST SETUP</p>

          {/* Ngrok Setup Info */}
          <NgrokSetup />

          {/* Connection Status */}
          <div className="bg-gray-900 p-3 md:p-4 rounded-lg mb-4 md:mb-6">
            <div className="flex items-center gap-2 mb-3 md:mb-4">
              {connected ? (
                <Wifi className="w-4 h-4 md:w-5 md:h-5 text-green-500" />
              ) : (
                <WifiOff className="w-4 h-4 md:w-5 md:h-5 text-red-500" />
              )}
              <span className={`text-sm md:text-base ${connected ? 'text-green-500' : 'text-red-500'}`}>
                {connected ? 'Server Connected' : 'Disconnected'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              <div className={`p-3 md:p-4 rounded border-2 ${lobbyState.p1Connected ? 'border-green-500 bg-green-900/20' : 'border-gray-700'}`}>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 md:w-5 md:h-5" />
                  <span className="text-sm md:text-base">Player 1</span>
                </div>
                <p className="text-xs md:text-sm mt-2">
                  {lobbyState.p1Connected ? (
                    lobbyState.p1Ready ? '✅ Ready' : '⏳ Connected'
                  ) : '❌ Not Connected'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  /client?p=1
                </p>
              </div>

              <div className={`p-3 md:p-4 rounded border-2 ${lobbyState.p2Connected ? 'border-green-500 bg-green-900/20' : 'border-gray-700'}`}>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 md:w-5 md:h-5" />
                  <span className="text-sm md:text-base">Player 2</span>
                </div>
                <p className="text-xs md:text-sm mt-2">
                  {lobbyState.p2Connected ? (
                    lobbyState.p2Ready ? '✅ Ready' : '⏳ Connected'
                  ) : '❌ Not Connected'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  /client?p=2
                </p>
              </div>
            </div>
          </div>

          {/* YouTube Input */}
          <div className="bg-gray-900 p-3 md:p-4 rounded-lg mb-4 md:mb-6">
            <div className="flex items-center gap-2 mb-3 md:mb-4">
              <Music className="w-4 h-4 md:w-5 md:h-5 text-red-500" />
              <span className="font-bold text-sm md:text-base">YouTube Video</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="Paste YouTube URL or video ID"
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-4 py-2 text-sm md:text-base"
              />
              <button
                onClick={loadYouTube}
                className="bg-red-600 hover:bg-red-500 px-3 md:px-4 py-2 rounded font-bold text-sm md:text-base whitespace-nowrap"
              >
                Load
              </button>
            </div>
            <div className="mt-4 w-full aspect-video bg-gray-800 rounded overflow-hidden">
              <div id="youtube-player" className="w-full h-full"></div>
            </div>
            {songDuration > 0 && (
              <p className="text-sm text-green-500 mt-2">
                ✅ Duration: {Math.floor(songDuration / 60)}:{Math.floor(songDuration % 60).toString().padStart(2, '0')}
              </p>
            )}
          </div>

          {/* MIDI File Selection */}
          <div className="bg-gray-900 p-3 md:p-4 rounded-lg mb-4 md:mb-6">
            <div className="flex items-center gap-2 mb-3 md:mb-4">
              <Upload className="w-4 h-4 md:w-5 md:h-5 text-purple-500" />
              <span className="font-bold text-sm md:text-base">MIDI File (Required)</span>
            </div>
            
            {/* Dropdown for pre-loaded MIDI files */}
            {availableMidiFiles.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Select from Midi Files folder:</label>
                <select
                  value={selectedMidiFile}
                  onChange={(e) => handleMidiSelect(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white"
                >
                  <option value="">-- Select a MIDI file --</option>
                  {availableMidiFiles.map(file => (
                    <option key={file} value={file}>{file}</option>
                  ))}
                </select>
              </div>
            )}

            {/* File upload option */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Or upload a MIDI file:</label>
              <input
                type="file"
                accept=".mid,.midi"
                onChange={handleMidiUpload}
                className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-purple-600 file:text-white hover:file:bg-purple-500"
              />
            </div>

            {midiNotes.length > 0 && (
              <p className="text-sm text-green-500 mt-3">
                ✅ Loaded {midiNotes.length} notes
                {selectedMidiFile && <span className="ml-2">from {selectedMidiFile}</span>}
              </p>
            )}
          </div>

          {/* LRC Lyrics */}
          <div className="bg-gray-900 p-3 md:p-4 rounded-lg mb-4 md:mb-6">
            <div className="flex items-center gap-2 mb-3 md:mb-4">
              <FileText className="w-4 h-4 md:w-5 md:h-5 text-blue-500" />
              <span className="font-bold text-sm md:text-base">LRC Lyrics (Optional)</span>
            </div>
            <textarea
              value={lrcText}
              onChange={(e) => setLrcText(e.target.value)}
              placeholder="[00:10.00] First line of lyrics..."
              rows={4}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 font-mono text-xs md:text-sm resize-y"
            />
            <button
              onClick={loadLyrics}
              className="mt-2 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded font-bold text-sm md:text-base w-full md:w-auto"
            >
              Parse Lyrics
            </button>
            {lyrics.length > 0 && (
              <p className="text-sm text-green-500 mt-2">
                ✅ Loaded {lyrics.length} lyric lines
              </p>
            )}
          </div>

          {/* Start Button */}
          <button
            onClick={startGame}
            disabled={!canStart}
            className={`w-full py-3 md:py-4 rounded-lg font-black text-lg md:text-2xl flex items-center justify-center gap-2 md:gap-4 ${
              canStart
                ? 'bg-cyan-600 hover:bg-cyan-500 cursor-pointer'
                : 'bg-gray-700 cursor-not-allowed'
            }`}
          >
            <Play className="w-6 h-6 md:w-8 md:h-8" />
            <span className="text-center">{canStart ? 'START BATTLE' : 'Waiting for players & assets...'}</span>
          </button>
        </div>
      </div>
    );
  }

  // Render game
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center p-4 md:p-8 select-none">
      {/* Header */}
      <div className="w-full max-w-5xl flex justify-between items-start mb-4 z-10">
        <div className="flex flex-col">
          <h1 className="text-3xl font-black italic text-cyan-500 tracking-tighter">VOCAL COMBAT</h1>
          <p className="text-xs text-yellow-500">
            SEGMENT {gameState.currentSegment}/4 — {gameState.attackingPlayer === 1 ? 'P1' : 'P2'} ATTACKING
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">
            P1: {gameState.player1.score.toString().padStart(5, '0')} | 
            P2: {gameState.player2.score.toString().padStart(5, '0')}
          </p>
        </div>
      </div>

      {/* YouTube Player (hidden during gameplay, just for audio) */}
      <div className="hidden">
        <div id="youtube-player"></div>
      </div>

      {/* Battle Stage */}
      <div className="flex-1 w-full max-w-5xl relative flex flex-col md:flex-row justify-around items-center gap-8">
        <Fighter 
          side="left" 
          hp={gameState.player1.hp} 
          name={gameState.player1.name}
          isAttacking={gameState.player1.isAttacking} 
          isDamaged={gameState.player1.isDamaged} 
        />

        {/* Center info */}
        <div className="flex flex-col items-center gap-4">
          <div className="bg-black/80 border-2 border-cyan-500 p-4 rounded-lg max-w-xs text-center">
            <p className="text-lg font-bold uppercase">{currentLyric || '♪ ♪ ♪'}</p>
          </div>
          
          <div className="flex gap-8 text-sm">
            <div className="text-center">
              <p className="text-gray-500">P1 Pitch</p>
              <p className="text-cyan-400 font-mono">
                {p1PitchRef.current > 0 ? `${Math.round(p1PitchRef.current)} Hz` : '—'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-gray-500">P2 Pitch</p>
              <p className="text-cyan-400 font-mono">
                {p2PitchRef.current > 0 ? `${Math.round(p2PitchRef.current)} Hz` : '—'}
              </p>
            </div>
          </div>
        </div>

        <Fighter 
          side="right" 
          hp={gameState.player2.hp} 
          name={gameState.player2.name}
          isAttacking={gameState.player2.isAttacking} 
          isDamaged={gameState.player2.isDamaged} 
        />
      </div>

      {/* Karaoke Highway */}
      <div className="w-full max-w-5xl mb-4">
        <KaraokeHighway 
          notes={midiNotes.map(n => ({
            time: n.time,
            pitch: n.pitch,
            duration: n.duration,
            lyrics: ''
          }))}
          currentTime={gameState.currentTime}
          currentPitch={gameState.attackingPlayer === 1 ? p1PitchRef.current : p2PitchRef.current}
        />
      </div>

      {/* Game Over Overlay */}
      {gameState.phase === GamePhase.GAME_OVER && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-8">
          <h2 className="text-6xl font-black italic text-cyan-500 mb-4">GAME OVER</h2>
          <p className="text-3xl text-yellow-400 mb-8">
            {gameState.winner === 'tie' 
              ? "IT'S A TIE!" 
              : `PLAYER ${gameState.winner} WINS!`}
          </p>
          <div className="flex gap-8 mb-8">
            <div className="text-center">
              <p className="text-gray-400">Player 1</p>
              <p className="text-4xl font-black">{gameState.player1.score}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-400">Player 2</p>
              <p className="text-4xl font-black">{gameState.player2.score}</p>
            </div>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="bg-cyan-600 hover:bg-cyan-500 px-8 py-4 rounded-full font-bold text-xl"
          >
            PLAY AGAIN
          </button>
        </div>
      )}
    </div>
  );
};

export default HostPage;
