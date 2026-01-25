
import React, { useMemo } from 'react';
import { Note, MidiNote } from '../types';

interface KaraokeHighwayProps {
  notes: (Note | MidiNote)[];
  currentTime: number;
  currentPitch: number;
  attackingPlayer?: 1 | 2;
}

// Fixed logarithmic scale constants
const MIN_FREQ = 20;
const MAX_FREQ = 5000;
const LOG_MIN = Math.log10(MIN_FREQ);
const LOG_MAX = Math.log10(MAX_FREQ);

// Option A labels: 20, 100, 200, 400, 800, 1600, 3200, 5000
const FREQ_LABELS = [20, 100, 200, 400, 800, 1600, 3200, 5000];

const KaraokeHighway: React.FC<KaraokeHighwayProps> = ({ 
  notes, 
  currentTime, 
  currentPitch,
  attackingPlayer 
}) => {
  const VIEW_WINDOW = 5; // Seconds shown ahead
  const VIEW_BEHIND = 1; // Seconds shown behind
  
  // Memoize visible notes calculation - only recalculate when notes or time changes significantly
  const visibleNotes = useMemo(() => {
    return notes.filter(n => 
      n.time >= currentTime - VIEW_BEHIND && 
      n.time <= currentTime + VIEW_WINDOW
    );
  }, [notes, Math.floor(currentTime * 10) / 10]); // Round time to 0.1s precision

  // Map frequency to vertical position using logarithmic scale
  // Higher frequencies at top (0%), lower at bottom (100%)
  const getTopPosition = (freq: number) => {
    if (freq <= 0) return '50%';
    // Clamp frequency to valid range
    const clampedFreq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq));
    const logFreq = Math.log10(clampedFreq);
    // Map log scale to percentage (inverted so high freq = top)
    const percent = 100 - ((logFreq - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100;
    return `${Math.max(2, Math.min(98, percent))}%`;
  };
  
  // Get position for frequency labels
  const getLabelPosition = (freq: number) => {
    const logFreq = Math.log10(freq);
    const percent = 100 - ((logFreq - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100;
    return percent;
  };

  // Check if pitch matches a note
  const isPitchMatch = (notePitch: number, playerPitch: number) => {
    if (playerPitch <= 0 || notePitch <= 0) return false;
    const cents = Math.abs(1200 * Math.log2(playerPitch / notePitch));
    return cents < 50; // Within 50 cents
  };

  return (
    <div className="relative w-full bg-gray-900 border-y-2 border-cyan-500/50 overflow-hidden mt-4" style={{ height: '50vh' }}>
      {/* Strike Line */}
      <div className="absolute left-24 top-0 w-1 h-full bg-yellow-400 z-10 shadow-[0_0_15px_rgba(255,255,0,0.5)]" />
      
      {/* Current time indicator */}
      <div className="absolute left-24 top-2 text-xs text-yellow-400 font-mono z-20">
        {currentTime.toFixed(1)}s
      </div>
      
      {/* Pitch Indicator (User's real-time voice) */}
      {currentPitch > 0 && (
        <div 
          className={`absolute left-24 w-8 h-8 rounded-full transition-all duration-75 z-20 shadow-[0_0_20px_white] flex items-center justify-center ${
            attackingPlayer === 1 ? 'bg-cyan-400' : 'bg-yellow-400'
          }`}
          style={{ 
            top: getTopPosition(currentPitch), 
            marginLeft: '-16px', 
            marginTop: '-16px' 
          }}
        >
          <span className="text-[10px] font-bold text-black">
            {Math.round(currentPitch)}
          </span>
        </div>
      )}

      {/* Frequency scale labels - Fixed logarithmic scale */}
      <div className="absolute left-0 top-0 h-full w-20 text-[9px] text-gray-400 font-mono">
        {FREQ_LABELS.map(freq => (
          <div 
            key={freq}
            className="absolute right-2"
            style={{ top: `${getLabelPosition(freq)}%`, transform: 'translateY(-50%)' }}
          >
            {freq >= 1000 ? `${freq/1000}k` : freq}Hz
          </div>
        ))}
      </div>
      
      {/* Horizontal guide lines at label positions */}
      <div className="absolute left-20 right-0 top-0 h-full pointer-events-none">
        {FREQ_LABELS.map(freq => (
          <div 
            key={freq}
            className={`absolute w-full h-px ${freq >= 100 && freq <= 800 ? 'bg-cyan-500/30' : 'bg-gray-700/30'}`}
            style={{ top: `${getLabelPosition(freq)}%` }}
          />
        ))}
      </div>

      {/* Staff Lines */}
      <div className="absolute inset-0 left-20 flex flex-col justify-between opacity-10 pointer-events-none">
        {[...Array(8)].map((_, i) => <div key={i} className="h-px bg-white w-full" />)}
      </div>

      {/* Scrolling Notes */}
      <div className="absolute inset-0 left-24">
        {visibleNotes.map((note, idx) => {
          const xPos = ((note.time - currentTime) / VIEW_WINDOW) * 100;
          const width = Math.max(2, (note.duration / VIEW_WINDOW) * 100);
          
          const isActive = currentTime >= note.time && currentTime <= note.time + note.duration;
          const isPast = currentTime > note.time + note.duration;
          const isMatching = isActive && isPitchMatch(note.pitch, currentPitch);

          return (
            <div 
              key={`${note.time}-${idx}`}
              className={`absolute h-4 rounded-md border flex items-center justify-center transition-all ${
                isMatching 
                  ? 'bg-green-500 border-green-300 animate-pulse scale-110' 
                  : isActive 
                    ? 'bg-yellow-500 border-yellow-300' 
                    : isPast
                      ? 'bg-gray-700 border-gray-600 opacity-50'
                      : 'bg-cyan-600 border-cyan-400'
              }`}
              style={{ 
                left: `${xPos}%`, 
                top: getTopPosition(note.pitch), 
                width: `${width}%`,
                minWidth: '20px',
                transform: 'translateY(-50%)'
              }}
            >
              <span className="text-[7px] font-bold text-white whitespace-nowrap overflow-hidden px-1">
                {Math.round(note.pitch)}Hz
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="absolute bottom-2 right-2 flex gap-3 text-[10px]">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-cyan-600 rounded" />
          <span className="text-gray-400">Upcoming</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-yellow-500 rounded" />
          <span className="text-gray-400">Active</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-500 rounded" />
          <span className="text-gray-400">Match!</span>
        </div>
      </div>
    </div>
  );
};

export default KaraokeHighway;
