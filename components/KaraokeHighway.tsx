
import React, { useRef, useMemo, memo } from 'react';
import { Note, MidiNote } from '../types';

interface KaraokeHighwayProps {
  notes: (Note | MidiNote)[];
  currentTime: number;
  currentPitch: number;
  attackingPlayer?: 1 | 2;
}

const KaraokeHighway: React.FC<KaraokeHighwayProps> = memo(({ 
  notes, 
  currentTime, 
  currentPitch,
  attackingPlayer 
}) => {
  const VIEW_WINDOW = 5; // Seconds shown ahead
  const VIEW_BEHIND = 1; // Seconds shown behind
  
  // Smoothed frequency range using refs to avoid jitter
  const smoothMinFreqRef = useRef(0);
  const smoothMaxFreqRef = useRef(600);
  
  // Find notes within the view window
  const visibleNotes = notes.filter(n => 
    n.time >= currentTime - VIEW_BEHIND && 
    n.time <= currentTime + VIEW_WINDOW
  );

  // Calculate target frequency range based on visible notes
  const freqs = visibleNotes.map(n => n.pitch).filter(f => f > 0);
  
  let targetMinFreq = 0;
  let targetMaxFreq = 600; // Default range for low notes
  
  if (freqs.length > 0) {
    const minNote = Math.min(...freqs);
    const maxNote = Math.max(...freqs);
    
    // Add 20% padding above and below for better visibility
    const padding = (maxNote - minNote) * 0.2;
    targetMinFreq = Math.max(0, minNote - padding);
    targetMaxFreq = maxNote + padding;
    
    // Ensure minimum range of 400 Hz for usability
    if (targetMaxFreq - targetMinFreq < 400) {
      const center = (targetMaxFreq + targetMinFreq) / 2;
      targetMinFreq = Math.max(0, center - 200);
      targetMaxFreq = center + 200;
    }
    
    // Round to nice numbers for cleaner display
    targetMinFreq = Math.floor(targetMinFreq / 50) * 50;
    targetMaxFreq = Math.ceil(targetMaxFreq / 50) * 50;
  }
  
  // Smooth the frequency range using exponential moving average
  // Higher smoothing factor = smoother but slower response
  const smoothingFactor = 0.15;
  smoothMinFreqRef.current += (targetMinFreq - smoothMinFreqRef.current) * smoothingFactor;
  smoothMaxFreqRef.current += (targetMaxFreq - smoothMaxFreqRef.current) * smoothingFactor;
  
  const minFreq = smoothMinFreqRef.current;
  const maxFreq = smoothMaxFreqRef.current;

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
    <div className="relative w-full bg-gray-900 border-y-2 border-cyan-500/50 overflow-hidden mt-4" style={{ height: '50vh' }}>
      {/* Strike Line */}
      <div className="absolute left-24 top-0 w-1 h-full bg-yellow-400 z-10 shadow-[0_0_15px_rgba(255,255,0,0.5)]" />
      
      {/* Current time indicator */}
      <div className="absolute left-24 top-2 text-xs text-yellow-400 font-mono z-20">
        {currentTime.toFixed(1)}s
      </div>
      
      {/* Dynamic range indicator */}
      <div className="absolute right-2 top-2 text-[9px] text-gray-500 font-mono z-20">
        Range: {Math.round(minFreq)}-{Math.round(maxFreq)}Hz
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

      {/* Frequency scale labels - Dynamic based on range */}
      <div className="absolute left-1 top-0 h-full flex flex-col justify-between py-2 text-[9px] text-gray-400 font-mono">
        <span>{Math.round(maxFreq)}Hz</span>
        <span>{Math.round(maxFreq * 0.83)}Hz</span>
        <span>{Math.round(maxFreq * 0.67)}Hz</span>
        <span>{Math.round(maxFreq * 0.5)}Hz</span>
        <span>{Math.round(maxFreq * 0.33)}Hz</span>
        <span>{Math.round(maxFreq * 0.17)}Hz</span>
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
});

export default KaraokeHighway;
