
import React from 'react';
import { Note, MidiNote } from '../types';

interface KaraokeHighwayProps {
  notes: (Note | MidiNote)[];
  currentTime: number;
  currentPitch: number;
  attackingPlayer?: 1 | 2;
}

const KaraokeHighway: React.FC<KaraokeHighwayProps> = ({ 
  notes, 
  currentTime, 
  currentPitch,
  attackingPlayer 
}) => {
  const VIEW_WINDOW = 5; // Seconds shown ahead
  const VIEW_BEHIND = 1; // Seconds shown behind
  
  // Find notes within the view window
  const visibleNotes = notes.filter(n => 
    n.time >= currentTime - VIEW_BEHIND && 
    n.time <= currentTime + VIEW_WINDOW
  );

  // Calculate frequency range from visible notes for dynamic scaling
  const freqs = visibleNotes.map(n => n.pitch).filter(f => f > 0);
  const minFreq = freqs.length > 0 ? Math.min(...freqs) * 0.8 : 200;
  const maxFreq = freqs.length > 0 ? Math.max(...freqs) * 1.2 : 600;

  // Map frequency to vertical position
  const getTopPosition = (freq: number) => {
    if (freq <= 0) return '50%';
    const percent = 100 - ((freq - minFreq) / (maxFreq - minFreq)) * 100;
    return `${Math.max(5, Math.min(95, percent))}%`;
  };

  // Check if pitch matches a note
  const isPitchMatch = (notePitch: number, playerPitch: number) => {
    if (playerPitch <= 0 || notePitch <= 0) return false;
    const cents = Math.abs(1200 * Math.log2(playerPitch / notePitch));
    return cents < 50; // Within 50 cents
  };

  return (
    <div className="relative w-full h-48 bg-gray-900 border-y-2 border-cyan-500/50 overflow-hidden mt-4">
      {/* Strike Line */}
      <div className="absolute left-24 top-0 w-1 h-full bg-yellow-400 z-10 shadow-[0_0_15px_rgba(255,255,0,0.5)]" />
      
      {/* Current time indicator */}
      <div className="absolute left-24 top-2 text-xs text-yellow-400 font-mono z-20">
        {currentTime.toFixed(1)}s
      </div>

      {/* Pitch Indicator (User's real-time voice) */}
      {currentPitch > 0 && (
        <div 
          className={`absolute left-24 w-6 h-6 rounded-full transition-all duration-75 z-20 shadow-[0_0_20px_white] flex items-center justify-center ${
            attackingPlayer === 1 ? 'bg-cyan-400' : 'bg-yellow-400'
          }`}
          style={{ 
            top: getTopPosition(currentPitch), 
            marginLeft: '-12px', 
            marginTop: '-12px' 
          }}
        >
          <span className="text-[8px] font-bold text-black">
            {Math.round(currentPitch)}
          </span>
        </div>
      )}

      {/* Frequency scale labels */}
      <div className="absolute left-2 top-0 h-full flex flex-col justify-between py-2 text-[10px] text-gray-500 font-mono">
        <span>{Math.round(maxFreq)}Hz</span>
        <span>{Math.round((maxFreq + minFreq) / 2)}Hz</span>
        <span>{Math.round(minFreq)}Hz</span>
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
              className={`absolute h-6 rounded-md border-2 flex items-center justify-center transition-all ${
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
                minWidth: '30px',
                transform: 'translateY(-50%)'
              }}
            >
              <span className="text-[9px] font-bold text-white whitespace-nowrap overflow-hidden px-1">
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
