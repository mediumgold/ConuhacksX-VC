
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, FighterStats, Note } from './types';
import { SONGS, HP_DAMAGE, WIN_MESSAGE, LOSE_MESSAGE } from './constants';
import { autoCorrelate } from './services/pitchDetection';
import { getBattleCommentary } from './services/geminiService';
import Fighter from './components/Fighter';
import KaraokeHighway from './components/KaraokeHighway';
import { Mic, Play, RotateCcw, MessageSquareQuote, AlertCircle, RefreshCw } from 'lucide-react';

const App: React.FC = () => {
  // Game State
  const [gameState, setGameState] = useState<GameState>(GameState.IDLE);
  const [player, setPlayer] = useState<FighterStats>({ hp: 100, maxHp: 100, name: 'You', isAttacking: false, isDamaged: false });
  const [aiFighter, setAiFighter] = useState<FighterStats>({ hp: 100, maxHp: 100, name: 'Scream Lord', isAttacking: false, isDamaged: false });
  const [currentTime, setCurrentTime] = useState(0);
  const [currentPitch, setCurrentPitch] = useState(-1);
  const [commentary, setCommentary] = useState("ARE YOU READY TO ROCK?!");
  const [score, setScore] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs for audio and game loop
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  // Fix: Added initial value undefined to satisfy TypeScript requirement for useRef which expected 1 argument.
  const animationFrameRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number>(0);
  const lastCommentaryTimeRef = useRef<number>(0);
  const processedNotesRef = useRef<Set<number>>(new Set());

  // Current Song
  const currentSong = SONGS[0];

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioCtxRef.current) audioCtxRef.current.close();
      if (sourceRef.current) sourceRef.current.disconnect();
    };
  }, []);

  // Start Mic
  const startMic = async () => {
    setErrorMessage(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Your browser does not support microphone access.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioContextClass();
      
      // Some browsers require explicit resume after user gesture
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }

      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      
      sourceRef.current = audioCtxRef.current.createMediaStreamSource(stream);
      sourceRef.current.connect(analyserRef.current);
      
      setGameState(GameState.PLAYING);
      startTimeRef.current = performance.now();
      requestAnimationFrame(gameLoop);
    } catch (err: any) {
      console.error("Mic initialization failed:", err);
      
      let friendlyMessage = "Failed to access microphone.";
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        friendlyMessage = "Microphone access denied. Please enable mic permissions in your browser settings.";
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        friendlyMessage = "No microphone found. Please connect a recording device and try again.";
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        friendlyMessage = "Microphone is already in use by another application.";
      } else {
        friendlyMessage = err.message || friendlyMessage;
      }
      
      setErrorMessage(friendlyMessage);
    }
  };

  // Game Loop
  const gameLoop = useCallback((time: number) => {
    if (!analyserRef.current || !audioCtxRef.current) return;

    // 1. Update Current Time
    const elapsed = (time - startTimeRef.current) / 1000;
    setCurrentTime(elapsed);

    // 2. Pitch Detection
    const buffer = new Float32Array(analyserRef.current.fftSize);
    analyserRef.current.getFloatTimeDomainData(buffer);
    const pitch = autoCorrelate(buffer, audioCtxRef.current.sampleRate);
    setCurrentPitch(pitch);

    // 3. Collision Detection (Note Scoring)
    currentSong.notes.forEach((note, idx) => {
      const withinTime = elapsed >= note.time && elapsed <= note.time + note.duration;
      
      if (withinTime && !processedNotesRef.current.has(idx)) {
        const diff = Math.abs(pitch - note.pitch);
        const tolerance = note.pitch * 0.15; 

        if (pitch > 0 && diff < tolerance) {
          handleHit(idx);
        }
      }

      if (elapsed > note.time + note.duration && !processedNotesRef.current.has(idx)) {
        handleMiss(idx);
      }
    });

    // 4. End Song Logic
    if (elapsed > currentSong.notes[currentSong.notes.length - 1].time + 3) {
      setGameState(GameState.GAME_OVER);
    }

    // 5. Dynamic AI Commentary
    if (time - lastCommentaryTimeRef.current > 6000) { 
      updateCommentary();
      lastCommentaryTimeRef.current = time;
    }

    if (gameState === GameState.PLAYING) {
      animationFrameRef.current = requestAnimationFrame(gameLoop);
    }
  }, [currentSong, gameState]);

  const handleHit = (noteIdx: number) => {
    processedNotesRef.current.add(noteIdx);
    setScore(s => s + 100);
    
    setPlayer(p => ({ ...p, isAttacking: true }));
    setAiFighter(ai => ({ ...ai, isDamaged: true, hp: Math.max(0, ai.hp - HP_DAMAGE) }));
    
    setTimeout(() => {
      setPlayer(p => ({ ...p, isAttacking: false }));
      setAiFighter(ai => ({ ...ai, isDamaged: false }));
    }, 400);
  };

  const handleMiss = (noteIdx: number) => {
    processedNotesRef.current.add(noteIdx);
    
    setAiFighter(ai => ({ ...ai, isAttacking: true }));
    setPlayer(p => ({ ...p, isDamaged: true, hp: Math.max(0, p.hp - HP_DAMAGE) }));
    
    setTimeout(() => {
      setAiFighter(ai => ({ ...ai, isAttacking: false }));
      setPlayer(p => ({ ...p, isDamaged: false }));
    }, 400);

    if (player.hp <= 0) setGameState(GameState.GAME_OVER);
  };

  const updateCommentary = async () => {
    const text = await getBattleCommentary(player.hp, aiFighter.hp, score / (processedNotesRef.current.size * 100 || 1));
    setCommentary(text);
  };

  const resetGame = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    processedNotesRef.current.clear();
    setPlayer({ hp: 100, maxHp: 100, name: 'You', isAttacking: false, isDamaged: false });
    setAiFighter({ hp: 100, maxHp: 100, name: 'Scream Lord', isAttacking: false, isDamaged: false });
    setCurrentTime(0);
    setScore(0);
    setGameState(GameState.IDLE);
    setErrorMessage(null);
    setCommentary("ROUND TWO? GO!");
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center p-4 md:p-8 select-none">
      
      {/* Header UI */}
      <div className="w-full max-w-5xl flex justify-between items-start mb-8 z-10">
        <div className="flex flex-col">
          <h1 className="text-3xl font-black italic text-cyan-500 tracking-tighter">VOCAL COMBAT</h1>
          <p className="text-xs retro-font text-yellow-500">PITCH DETECTION FIGHTER</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-white retro-font">{score.toString().padStart(6, '0')}</p>
          <p className="text-[10px] text-gray-500">HI-SCORE: 099999</p>
        </div>
      </div>

      {/* Battle Stage */}
      <div className="flex-1 w-full max-w-5xl relative flex flex-col md:flex-row justify-around items-center gap-12 mt-4">
        
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-cyan-500/20 blur-[100px] rounded-full" />
          <div className="grid grid-cols-12 gap-1 w-full h-full">
            {[...Array(100)].map((_, i) => <div key={i} className="h-4 bg-white/5" />)}
          </div>
        </div>

        <Fighter 
          side="left" 
          hp={player.hp} 
          name={player.name} 
          isAttacking={player.isAttacking} 
          isDamaged={player.isDamaged} 
        />

        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center">
           {gameState === GameState.PLAYING && (
              <div className="bg-black/80 border-2 border-cyan-500 p-4 rounded-lg shadow-[0_0_20px_rgba(6,182,212,0.5)] max-w-xs text-center animate-pulse">
                <MessageSquareQuote className="w-4 h-4 text-cyan-500 mb-1 mx-auto" />
                <p className="text-sm font-bold uppercase tracking-wide leading-tight italic">
                   "{commentary}"
                </p>
              </div>
           )}
        </div>

        <Fighter 
          side="right" 
          hp={aiFighter.hp} 
          name={aiFighter.name} 
          isAttacking={aiFighter.isAttacking} 
          isDamaged={aiFighter.isDamaged} 
        />
      </div>

      {/* Karaoke Track Highway */}
      {gameState === GameState.PLAYING && (
        <div className="w-full max-w-5xl mb-8">
          <KaraokeHighway 
            notes={currentSong.notes} 
            currentTime={currentTime} 
            currentPitch={currentPitch} 
          />
        </div>
      )}

      {/* Interaction Layer */}
      <div className="w-full max-w-5xl flex justify-center pb-8">
        {gameState === GameState.IDLE && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
             <div className="text-center mb-8">
               <p className="text-xl font-bold text-cyan-400 mb-2 uppercase">Your voice is your weapon</p>
               <p className="text-sm text-gray-400">Match the scrolling note pitches to launch attacks.</p>
             </div>
             
             {errorMessage && (
               <div className="mb-6 flex items-start gap-3 bg-red-900/30 border border-red-500 p-4 rounded-lg max-w-md text-red-200 animate-bounce">
                 <AlertCircle className="w-5 h-5 flex-shrink-0" />
                 <div>
                   <p className="text-sm font-bold uppercase mb-1">Hardware Error</p>
                   <p className="text-xs leading-relaxed">{errorMessage}</p>
                 </div>
               </div>
             )}

             <button 
                onClick={startMic}
                className="group relative flex items-center justify-center bg-cyan-600 hover:bg-cyan-500 px-12 py-6 rounded-full font-black text-2xl transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(6,182,212,0.3)]"
             >
                <Mic className="w-8 h-8 mr-4 group-hover:rotate-12 transition-transform" />
                {errorMessage ? "TRY AGAIN" : "START CHALLENGE"}
                <div className="absolute -inset-1 bg-cyan-400/20 blur-md rounded-full -z-10 group-hover:bg-cyan-400/40" />
             </button>
          </div>
        )}

        {gameState === GameState.GAME_OVER && (
          <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-8 animate-in fade-in duration-700">
            <h2 className="text-6xl font-black italic text-cyan-500 mb-2">GAME OVER</h2>
            <p className="text-xl retro-font text-yellow-400 mb-8 text-center max-w-md">
              {player.hp > aiFighter.hp ? WIN_MESSAGE : LOSE_MESSAGE}
            </p>
            <div className="bg-gray-900/50 p-6 rounded-xl border border-white/10 mb-8 text-center">
              <p className="text-gray-400 uppercase text-xs mb-1 tracking-widest">Final Performance Score</p>
              <p className="text-5xl font-black text-white">{score}</p>
            </div>
            <button 
              onClick={resetGame}
              className="flex items-center bg-white text-black px-10 py-5 rounded-full font-bold hover:bg-cyan-400 transition-colors shadow-lg"
            >
              <RotateCcw className="w-6 h-6 mr-3" />
              RETRY CONCERT
            </button>
          </div>
        )}

        {gameState === GameState.PLAYING && (
          <div className="flex items-center gap-4 bg-gray-900/50 px-6 py-3 rounded-full border border-white/5">
             <div className="flex flex-col items-center">
               <span className="text-[10px] text-gray-500 uppercase font-bold">Mic Status</span>
               <div className="flex items-center text-green-500 font-bold text-xs">
                 <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-2" />
                 LIVE
               </div>
             </div>
             <div className="w-px h-8 bg-white/10" />
             <div className="flex flex-col items-center min-w-[100px]">
               <span className="text-[10px] text-gray-500 uppercase font-bold">Detected Pitch</span>
               <span className="text-cyan-400 font-bold tabular-nums">
                 {currentPitch > 0 ? `${Math.round(currentPitch)} Hz` : "WAITING..."}
               </span>
             </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-4 right-4 text-[10px] text-gray-600 uppercase tracking-widest hidden md:block">
        Built with Google Gemini & Web Audio API
      </div>
    </div>
  );
};

export default App;
