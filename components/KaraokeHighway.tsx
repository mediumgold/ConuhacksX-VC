
import React from 'react';
import { Note } from '../types';

interface KaraokeHighwayProps {
  notes: Note[];
  currentTime: number;
  currentPitch: number;
}

const KaraokeHighway: React.FC<KaraokeHighwayProps> = ({ notes, currentTime, currentPitch }) => {
  const VIEW_WINDOW = 5; // Seconds shown ahead
  
  // Find notes within the view window
  const visibleNotes = notes.filter(n => n.time >= currentTime - 1 && n.time <= currentTime + VIEW_WINDOW);

  // Map frequency to vertical position (approx C4-C5 range)
  const getTopPosition = (freq: number) => {
    const minFreq = 250;
    const maxFreq = 550;
    const percent = 100 - ((freq - minFreq) / (maxFreq - minFreq)) * 100;
    return `${Math.max(0, Math.min(90, percent))}%`;
  };

  return (
    <div className="relative w-full h-48 bg-gray-900 border-y-2 border-cyan-500/50 overflow-hidden mt-8">
      {/* Strike Line */}
      <div className="absolute left-20 top-0 w-1 h-full bg-yellow-400 z-10 shadow-[0_0_15px_rgba(255,255,0,0.5)]" />
      
      {/* Pitch Indicator (User's real-time voice) */}
      {currentPitch > 0 && (
        <div 
          className="absolute left-20 w-4 h-4 bg-white rounded-full transition-all duration-75 z-20 shadow-[0_0_20px_white]"
          style={{ top: getTopPosition(currentPitch), marginLeft: '-8px', marginTop: '-8px' }}
        />
      )}

      {/* Staff Lines */}
      <div className="absolute inset-0 flex flex-col justify-between opacity-10 pointer-events-none px-4">
        {[...Array(5)].map((_, i) => <div key={i} className="h-px bg-white w-full" />)}
      </div>

      {/* Scrolling Notes */}
      <div className="absolute inset-0">
        {visibleNotes.map((note, idx) => {
          const xPos = ((note.time - currentTime) / VIEW_WINDOW) * 100;
          const width = (note.duration / VIEW_WINDOW) * 100;
          
          const isHit = Math.abs(currentTime - note.time) < 0.2;

          return (
            <div 
              key={idx}
              className={`absolute h-8 rounded-full border-2 border-white flex items-center justify-center transition-opacity ${
                isHit ? 'bg-yellow-500 animate-pulse' : 'bg-cyan-600'
              }`}
              style={{ 
                left: `calc(${xPos}% + 20px)`, 
                top: getTopPosition(note.pitch), 
                width: `${width}%`,
                transform: 'translateY(-50%)'
              }}
            >
              <span className="text-[10px] font-bold text-white uppercase whitespace-nowrap overflow-hidden px-2">
                {note.lyrics}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default KaraokeHighway;
