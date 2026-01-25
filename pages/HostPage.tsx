import React, { useState, useEffect, useRef, useCallback } from 'react';
import { socketClient } from '../services/socketClient';
import { parseLRC, getLyricAtTime, extractYouTubeTitle } from '../services/lrcParser';
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
  const [fetchingLyrics, setFetchingLyrics] = useState(false);
  
  // Dropdown data
  const [youtubeLinks, setYoutubeLinks] = useState<{name: string; url: string}[]>([]);
  const [selectedYoutubeLink, setSelectedYoutubeLink] = useState('');
  const [lyricsFiles, setLyricsFiles] = useState<string[]>([]);
  const [selectedLyricsFile, setSelectedLyricsFile] = useState('');
  
  // Parsed data
  const [lyrics, setLyrics] = useState<LrcLine[]>([]);
  const [midiNotes, setMidiNotes] = useState<MidiNote[]>([]);
  const [songDuration, setSongDuration] = useState(0);
  
  // Game state
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentLyric, setCurrentLyric] = useState('');
  const [nextLyric, setNextLyric] = useState('');
  
  // Player pitches (received from clients) - using state to trigger re-renders
  const [p1Pitch, setP1Pitch] = useState(-1);
  const [p2Pitch, setP2Pitch] = useState(-1);
  // Refs for pitch values to avoid stale closure in game loop
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
      // Log every pitch to verify data is arriving
      console.log(`[Host] 🎤 Received pitch from P${data.slot}:`, Math.round(data.pitch), 'Hz');
      
      if (data.slot === 1) {
        setP1Pitch(data.pitch);
        p1PitchRef.current = data.pitch;
      } else {
        setP2Pitch(data.pitch);
        p2PitchRef.current = data.pitch;
      }
    });

    socketClient.on('disconnected', () => {
      setConnected(false);
    });

    return () => {
      socketClient.disconnect();
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, []);

  // Fetch dropdown data function
  const fetchAllData = useCallback(async () => {
    // Use relative URLs so Vite proxy can handle them
    console.log('[HostPage] Fetching dropdown data...');

    // Fetch MIDI files
    try {
      console.log('[HostPage] Fetching MIDI files from: /api/midi-files');
      const midiRes = await fetch('/api/midi-files');
      console.log('[HostPage] MIDI response status:', midiRes.status);
      const midiData = await midiRes.json();
      console.log('[HostPage] MIDI data received:', midiData);
      setAvailableMidiFiles(midiData.files || []);
      console.log('[HostPage] MIDI files state updated');
    } catch (err) {
      console.error('[HostPage] MIDI fetch error:', err);
    }

    // Fetch YouTube links
    try {
      console.log('[HostPage] Fetching YouTube links from: /api/youtube-links');
      const ytRes = await fetch('/api/youtube-links');
      console.log('[HostPage] YouTube response status:', ytRes.status);
      const ytData = await ytRes.json();
      console.log('[HostPage] YouTube data received:', ytData);
      setYoutubeLinks(ytData.links || []);
      console.log('[HostPage] YouTube links state updated');
    } catch (err) {
      console.error('[HostPage] YouTube links fetch error:', err);
    }

    // Fetch lyrics files
    try {
      console.log('[HostPage] Fetching lyrics files from: /api/lyrics-files');
      const lyricsRes = await fetch('/api/lyrics-files');
      console.log('[HostPage] Lyrics response status:', lyricsRes.status);
      const lyricsData = await lyricsRes.json();
      console.log('[HostPage] Lyrics data received:', lyricsData);
      setLyricsFiles(lyricsData.files || []);
      console.log('[HostPage] Lyrics files state updated');
    } catch (err) {
      console.error('[HostPage] Lyrics fetch error:', err);
    }
  }, []);

  // Fetch dropdown data on mount
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

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

  // Handle YouTube link selection from dropdown
  const handleYoutubeLinkSelect = (linkName: string) => {
    setSelectedYoutubeLink(linkName);
    const link = youtubeLinks.find(l => l.name === linkName);
    if (link) {
      setYoutubeUrl(link.url);
      // Auto-load the video
      const id = parseYouTubeId(link.url);
      if (id) {
        setYoutubeId(id);
        if (ytPlayerRef.current) {
          ytPlayerRef.current.loadVideoById(id);
        } else {
          // Will be loaded when player is ready
          loadYouTubeById(id);
        }
      }
    }
  };

  // Handle lyrics file selection from dropdown
  const handleLyricsFileSelect = async (filename: string) => {
    if (!filename) return;
    setSelectedLyricsFile(filename);
    
    try {
      const url = `/api/lyrics-file/${encodeURIComponent(filename)}`;
      console.log('[HostPage] Fetching lyrics from:', url);
      
      const response = await fetch(url);
      console.log('[HostPage] Lyrics response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[HostPage] Lyrics data received:', data);
      
      if (data.content) {
        setLrcText(data.content);
        // Auto-parse the lyrics
        const parsed = parseLRC(data.content);
        if (parsed.length > 0) {
          setLyrics(parsed);
          console.log('[HostPage] Lyrics parsed:', parsed.length, 'lines');
        }
      }
    } catch (err) {
      console.error('[HostPage] Failed to load lyrics file:', err);
      alert(`Failed to load lyrics file: ${err}`);
    }
  };

  // Load YouTube video by ID - uses persistent player div
  const loadYouTubeById = (id: string) => {
    const initPlayer = () => {
      // Use the persistent player div that survives view changes
      const playerDiv = document.getElementById('youtube-player') || document.getElementById('youtube-player-persistent');
      if (!playerDiv) {
        console.error('[HostPage] No YouTube player div found');
        return;
      }
      
      ytPlayerRef.current = new window.YT.Player(playerDiv.id, {
        height: '200',
        width: '100%',
        videoId: id,
        playerVars: {
          playsinline: 1,
          mute: 1,
          autoplay: 0
        },
        events: {
          onReady: (event: any) => {
            console.log('[HostPage] YouTube player ready');
            ytReadyRef.current = true;
            const duration = event.target.getDuration();
            setSongDuration(duration);
          },
          onStateChange: (event: any) => {
            console.log('[HostPage] YouTube state changed:', event.data);
            if (event.data === window.YT.PlayerState.ENDED) {
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
      const playerDiv = document.getElementById('youtube-player') || document.getElementById('youtube-player-persistent');
      if (!playerDiv) {
        console.error('[HostPage] No YouTube player div found');
        return;
      }
      
      ytPlayerRef.current = new window.YT.Player(playerDiv.id, {
        height: '200',
        width: '100%',
        videoId: id,
        playerVars: {
          playsinline: 1,
          mute: 1,
          autoplay: 0
        },
        events: {
          onReady: (event: any) => {
            console.log('[HostPage] YouTube player ready');
            ytReadyRef.current = true;
            const duration = event.target.getDuration();
            setSongDuration(duration);
          },
          onStateChange: (event: any) => {
            console.log('[HostPage] YouTube state changed:', event.data);
            if (event.data === window.YT.PlayerState.ENDED) {
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

  // Auto-fill lyrics from lrclib.net using YouTube video title
  const autoFillLyrics = async () => {
    if (!ytPlayerRef.current || !ytReadyRef.current) {
      alert('Please load a YouTube video first');
      return;
    }

    setFetchingLyrics(true);

    try {
      // Get video title from YouTube player
      const videoData = ytPlayerRef.current.getVideoData();
      const videoTitle = videoData.title;

      if (!videoTitle) {
        throw new Error('Could not get video title');
      }

      // Extract artist and title from video title
      const { title, artist } = extractYouTubeTitle(videoTitle);
      console.log('Searching for lyrics:', { title, artist });

      // Get server URL
      let serverUrl = 'http://localhost:3001';
      const stored = sessionStorage.getItem('ngrok-config');
      if (stored) {
        const config = JSON.parse(stored);
        if (config.serverUrl) {
          serverUrl = config.serverUrl;
        }
      }

      // Fetch from backend API
      const params = new URLSearchParams({ title });
      if (artist) {
        params.append('artist', artist);
      }

      const response = await fetch(`${serverUrl}/api/lyrics/search?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch lyrics');
      }

      const results = await response.json();

      if (!results || results.length === 0) {
        alert(`No lyrics found for "${title}"${artist ? ` by ${artist}` : ''}`);
        return;
      }

      // Get the first result
      const firstResult = results[0];
      const syncedLyrics = firstResult.syncedLyrics || firstResult.plainLyrics;

      if (!syncedLyrics) {
        alert('No synced lyrics available for this song');
        return;
      }

      // Auto-fill the text area
      setLrcText(syncedLyrics);

      // Auto-parse the lyrics
      const parsed = parseLRC(syncedLyrics);
      if (parsed.length > 0) {
        setLyrics(parsed);
        alert(`✅ Loaded ${parsed.length} lyric lines from lrclib.net`);
      } else {
        alert('Lyrics fetched but failed to parse. Please check the format.');
      }
    } catch (err) {
      console.error('Failed to auto-fill lyrics:', err);
      alert('Failed to fetch lyrics. Please try manually entering them.');
    } finally {
      setFetchingLyrics(false);
    }
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
      const url = `/midi/${encodeURIComponent(filename)}`;
      console.log('[HostPage] Fetching MIDI from:', url);
      
      const response = await fetch(url);
      console.log('[HostPage] MIDI response status:', response.status);
      console.log('[HostPage] MIDI response headers:', response.headers.get('content-type'));
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      console.log('[HostPage] MIDI buffer size:', arrayBuffer.byteLength);
      
      const notes = await parseMidiFile(arrayBuffer);
      setMidiNotes(notes);
      console.log('[HostPage] MIDI notes loaded:', notes.length);
      
      // Update duration from MIDI if longer
      if (notes.length > 0) {
        const lastNote = notes[notes.length - 1];
        const midiDuration = lastNote.time + lastNote.duration;
        if (midiDuration > songDuration) {
          setSongDuration(midiDuration);
        }
      }
    } catch (err) {
      console.error('[HostPage] Failed to load MIDI:', err);
      alert(`Failed to load MIDI file: ${err}`);
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

    // Notify clients first
    console.log('[HostPage] Calling socketClient.startGame() to notify clients...');
    socketClient.startGame(songConfig);

    // Start YouTube playback BEFORE changing state (while player DOM still exists)
    console.log('[HostPage] Starting YouTube playback...');
    ytPlayerRef.current.unMute();
    ytPlayerRef.current.setVolume(100);
    ytPlayerRef.current.seekTo(0, true);
    ytPlayerRef.current.playVideo();
    gameStartTimeRef.current = performance.now();

    // Small delay to ensure video starts playing before switching views
    setTimeout(() => {
      // Get fresh duration from YouTube player (in case state wasn't updated yet)
      let duration = songDuration;
      if (ytPlayerRef.current && ytPlayerRef.current.getDuration) {
        const ytDuration = ytPlayerRef.current.getDuration();
        if (ytDuration > 0) {
          duration = ytDuration;
        }
      }
      
      // Fallback: use MIDI duration if YouTube duration is still 0
      if (duration <= 0 && midiNotes.length > 0) {
        const lastNote = midiNotes[midiNotes.length - 1];
        duration = lastNote.time + lastNote.duration;
      }
      
      // Final fallback: 3 minutes default
      if (duration <= 0) {
        duration = 180;
        console.warn('[HostPage] ⚠️ Could not determine song duration, using default 180s');
      }
      
      console.log('[HostPage] Starting game with duration:', duration, 'seconds');
      
      // Initialize game state - this will trigger view switch
      const initialState = createInitialGameState(duration);
      initialState.phase = GamePhase.PLAYING;
      setGameState(initialState);
      console.log('[HostPage] Game state set to PLAYING');
    }, 100);
  };

  // Game loop
  const gameLoop = useCallback(() => {
    if (!ytPlayerRef.current || !ytReadyRef.current) {
      console.log('[GameLoop] Waiting for YouTube player...', { player: !!ytPlayerRef.current, ready: ytReadyRef.current });
      gameLoopRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    const currentTime = ytPlayerRef.current.getCurrentTime() || 0;
    const playerState = ytPlayerRef.current.getPlayerState?.();
    
    // Log every second approximately
    if (Math.floor(currentTime * 10) % 10 === 0) {
      console.log('[GameLoop] Running:', { currentTime: currentTime.toFixed(2), playerState, midiNotes: midiNotes.length });
    }

    setGameState(prevState => {
      if (!prevState || prevState.phase !== GamePhase.PLAYING) {
        return prevState;
      }

      // Process tick - use refs to get current pitch values (avoid stale closure)
      const { gameState: newState, p1Accuracy, p2Accuracy, p1Damage, p2Damage } = processGameTick(
        prevState,
        midiNotes,
        p1PitchRef.current,
        p2PitchRef.current,
        currentTime
      );
      
      // Log when damage is dealt
      if (p1Damage > 0 || p2Damage > 0) {
        console.log(`[GameLoop] ⚔️ DAMAGE! P1 dealt ${p1Damage.toFixed(1)} (acc: ${(p1Accuracy*100).toFixed(0)}%), P2 dealt ${p2Damage.toFixed(1)} (acc: ${(p2Accuracy*100).toFixed(0)}%)`);
      }

      // Update current lyric and next lyric
      const lyric = getLyricAtTime(lyrics, currentTime);
      setCurrentLyric(lyric?.text || '');

      // Find next lyric
      if (lyrics.length > 0) {
        const currentIndex = lyrics.findIndex(l => l === lyric);
        if (currentIndex >= 0 && currentIndex < lyrics.length - 1) {
          setNextLyric(lyrics[currentIndex + 1].text);
        } else if (currentIndex === -1 && lyrics.length > 0) {
          // Before first lyric, show first lyric as next
          const firstUpcoming = lyrics.find(l => l.time > currentTime);
          setNextLyric(firstUpcoming?.text || '');
        } else {
          setNextLyric('');
        }
      }

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

  // Start game loop when game enters PLAYING phase
  useEffect(() => {
    if (gameState?.phase === GamePhase.PLAYING && !gameLoopRef.current) {
      console.log('[HostPage] Game phase is PLAYING, starting game loop');
      gameLoop();
    }
    
    return () => {
      if (gameLoopRef.current && gameState?.phase !== GamePhase.PLAYING) {
        console.log('[HostPage] Game phase changed from PLAYING, stopping game loop');
        cancelAnimationFrame(gameLoopRef.current);
        gameLoopRef.current = null;
      }
    };
  }, [gameState?.phase, gameLoop]);

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

  // Check if ready to start - requires YouTube, MIDI, and Lyrics
  const canStart = connected && 
    lobbyState.p1Connected && 
    lobbyState.p2Connected && 
    allReady && 
    youtubeId && 
    midiNotes.length > 0 &&
    lyrics.length > 0;

  const isLobby = !gameState || gameState.phase === GamePhase.LOBBY;
  const isPlaying = gameState?.phase === GamePhase.PLAYING;
  const isGameOver = gameState?.phase === GamePhase.GAME_OVER;

  // Use a single return with conditional visibility to preserve YouTube player
  return (
    <>
      {/* Persistent YouTube Player Container - always mounted, visible in lobby, hidden during game */}
      <div 
        id="persistent-yt-container" 
        className={isLobby ? 'hidden' : 'fixed top-0 left-0 w-1 h-1 opacity-0 pointer-events-none overflow-hidden'}
        style={{ zIndex: -1 }}
      >
        <div id="youtube-player-persistent"></div>
      </div>

      {/* Lobby View - use CSS visibility instead of conditional render to preserve YouTube player */}
      <div 
        className={`min-h-screen h-full bg-black text-white overflow-y-auto ${isLobby ? '' : 'hidden'}`}
      >
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
              <span className="font-bold text-sm md:text-base">YouTube Video (Required)</span>
            </div>
            
            {/* Dropdown for YouTube links from links.txt */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Select a song:</label>
              <select
                value={selectedYoutubeLink}
                onChange={(e) => handleYoutubeLinkSelect(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white"
              >
                <option value="">{youtubeLinks.length === 0 ? '-- Loading songs... --' : '-- Select a song --'}</option>
                {youtubeLinks.map(link => (
                  <option key={link.name} value={link.name}>{link.name}</option>
                ))}
              </select>
            </div>

            {/* Manual URL input as fallback */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Or paste YouTube URL:</label>
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
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm text-gray-400">Select from Midi Files folder:</label>
                <button
                  onClick={fetchAllData}
                  className="text-xs text-cyan-400 hover:text-cyan-300 underline"
                >
                  🔄 Refresh
                </button>
              </div>
              <select
                value={selectedMidiFile}
                onChange={(e) => handleMidiSelect(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white"
              >
                <option value="">{availableMidiFiles.length === 0 ? '-- Loading MIDI files... --' : '-- Select a MIDI file --'}</option>
                {availableMidiFiles.map(file => (
                  <option key={file} value={file}>{file}</option>
                ))}
              </select>
            </div>

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
              <span className="font-bold text-sm md:text-base">LRC Lyrics (Required)</span>
            </div>
            
            {/* Dropdown for lyrics files from Lyrics folder */}
            <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm text-gray-400">Select lyrics file:</label>
                  <button
                    onClick={fetchAllData}
                    className="text-xs text-cyan-400 hover:text-cyan-300 underline"
                  >
                    🔄 Refresh
                  </button>
                </div>
                <select
                  value={selectedLyricsFile}
                  onChange={(e) => handleLyricsFileSelect(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white"
                >
                  <option value="">{lyricsFiles.length === 0 ? '-- Loading lyrics files... --' : '-- Select a lyrics file --'}</option>
                  {lyricsFiles.map(file => (
                    <option key={file} value={file}>{file.replace('.txt', '')}</option>
                  ))}
                </select>
            </div>

            {/* Manual lyrics input as fallback */}
            <div className="mb-2">
              <label className="block text-sm text-gray-400 mb-2">Or paste LRC lyrics:</label>
              <textarea
                value={lrcText}
                onChange={(e) => setLrcText(e.target.value)}
                placeholder="[00:10.00] First line of lyrics..."
                rows={4}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 font-mono text-xs md:text-sm resize-y"
              />
            </div>
            <button
              onClick={loadLyrics}
              className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded font-bold text-sm md:text-base mt-2"
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

      {/* Game View */}
      {(isPlaying || isGameOver) && gameState && (
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
              <div className="bg-black/80 border-2 border-cyan-500 p-4 rounded-lg max-w-md text-center">
                <p className="text-xs text-gray-400 mb-1">NOW</p>
                <p className="text-lg font-bold uppercase text-cyan-400">{currentLyric || '♪ ♪ ♪'}</p>
                {nextLyric && (
                  <>
                    <div className="border-t border-gray-700 my-2"></div>
                    <p className="text-xs text-gray-400 mb-1">NEXT</p>
                    <p className="text-sm text-gray-300">{nextLyric}</p>
                  </>
                )}
              </div>
              
              <div className="flex gap-8 text-sm">
                <div className="text-center">
                  <p className="text-gray-500">P1 Pitch</p>
                  <p className="text-cyan-400 font-mono">
                    {p1Pitch > 0 ? `${Math.round(p1Pitch)} Hz` : '—'}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-gray-500">P2 Pitch</p>
                  <p className="text-cyan-400 font-mono">
                    {p2Pitch > 0 ? `${Math.round(p2Pitch)} Hz` : '—'}
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
              currentPitch={gameState.attackingPlayer === 1 ? p1Pitch : p2Pitch}
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
      )}
    </>
  );
};

export default HostPage;
