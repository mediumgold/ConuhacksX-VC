import React, { useMemo, useRef } from 'react';
import { Note, MidiNote } from '../types';

interface KaraokeHighwayProps {
  notes: (Note | MidiNote)[];
  currentTime: number;
  currentPitch: number;
  attackingPlayer?: 1 | 2;
}

const VIEW_AHEAD = 5;   // seconds visible to the right of the playhead
const VIEW_BEHIND = 1.2; // seconds visible to the left
const PLAYHEAD_X = 18;  // % from left
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const freqToMidi = (f: number) => 12 * Math.log2(f / 440) + 69;
const midiName = (m: number) => `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

// Fold a midi value by octaves until it sits inside [lo, hi]
function foldToRange(midi: number, lo: number, hi: number): number {
  let m = midi;
  while (m < lo - 0.5) m += 12;
  while (m > hi + 0.5) m -= 12;
  return m;
}

const KaraokeHighway: React.FC<KaraokeHighwayProps> = ({ notes, currentTime, currentPitch }) => {
  // Melody lane range: derived once from the whole song, padded a bit
  const range = useMemo(() => {
    const midis = notes.filter(n => n.pitch > 0).map(n => freqToMidi(n.pitch));
    if (midis.length === 0) return { lo: 55, hi: 74 }; // G3..D5 default
    let lo = Math.floor(Math.min(...midis)) - 2;
    let hi = Math.ceil(Math.max(...midis)) + 2;
    if (hi - lo < 10) { const pad = Math.ceil((10 - (hi - lo)) / 2); lo -= pad; hi += pad; }
    if (hi - lo > 30) { // extreme outliers: clamp lane to the dense middle
      const sorted = [...midis].sort((a, b) => a - b);
      lo = Math.floor(sorted[Math.floor(sorted.length * 0.05)]) - 2;
      hi = Math.ceil(sorted[Math.floor(sorted.length * 0.95)]) + 2;
    }
    return { lo, hi };
  }, [notes]);

  const midiToY = (m: number) => ((range.hi - m) / (range.hi - range.lo)) * 100;
  const timeToX = (t: number) =>
    PLAYHEAD_X + ((t - currentTime) / VIEW_AHEAD) * (100 - PLAYHEAD_X);

  const visibleNotes = useMemo(
    () => notes.filter(n =>
      n.time + n.duration >= currentTime - VIEW_BEHIND &&
      n.time <= currentTime + VIEW_AHEAD
    ),
    [notes, Math.floor(currentTime * 10)]
  );

  // Active note under the playhead
  const activeNote = visibleNotes.find(n => currentTime >= n.time && currentTime <= n.time + n.duration) || null;

  // Sung pitch, folded into the lane (matches octave-fair scoring)
  const sungMidiRaw = currentPitch > 0 ? freqToMidi(currentPitch) : null;
  const sungMidi = sungMidiRaw !== null ? foldToRange(sungMidiRaw, range.lo, range.hi) : null;
  const isMatch = activeNote && sungMidi !== null
    ? Math.abs(foldToRange(sungMidi, freqToMidi(activeNote.pitch) - 6, freqToMidi(activeNote.pitch) + 6) - freqToMidi(activeNote.pitch)) < 1
    : false;

  // Pitch trail: keep last ~1.5s of (time, midi) samples
  const trailRef = useRef<{ t: number; m: number }[]>([]);
  if (sungMidi !== null) {
    const trail = trailRef.current;
    if (trail.length === 0 || currentTime - trail[trail.length - 1].t > 0.03) {
      trail.push({ t: currentTime, m: sungMidi });
    }
  }
  trailRef.current = trailRef.current.filter(p => currentTime - p.t < 1.5 && p.t <= currentTime);

  // Axis rows: label C, E, G (and every semitone gets a faint line if lane is narrow)
  const rows = [];
  for (let m = range.lo; m <= range.hi; m++) rows.push(m);
  const labelEvery = rows.length > 20 ? [0, 4, 7] : [0, 2, 4, 5, 7, 9, 11]; // pitch classes to label

  return (
    <div className="w-full rounded-xl border border-cyan-900/60 bg-[#060a18] overflow-hidden select-none" style={{ height: 230 }}>
      <div className="relative w-full h-full">
        {/* rows */}
        {rows.map(m => {
          const labeled = labelEvery.includes(((m % 12) + 12) % 12);
          return (
            <div key={m} className="absolute left-0 right-0" style={{ top: `${midiToY(m)}%` }}>
              <div className={`w-full ${labeled ? 'border-t border-cyan-800/40' : 'border-t border-cyan-900/20'}`} />
              {labeled && (
                <span className="absolute left-2 -top-2 text-[10px] font-mono text-cyan-700">{midiName(m)}</span>
              )}
            </div>
          );
        })}

        {/* past shade */}
        <div className="absolute top-0 bottom-0 left-0 bg-black/35" style={{ width: `${PLAYHEAD_X}%` }} />

        {/* notes */}
        {visibleNotes.map((n, i) => {
          const m = freqToMidi(n.pitch);
          const x1 = Math.max(timeToX(n.time), 0);
          const x2 = Math.min(timeToX(n.time + n.duration), 100);
          if (x2 <= 0 || x1 >= 100) return null;
          const isActive = activeNote === n;
          const isPast = n.time + n.duration < currentTime;
          const rowH = 100 / (range.hi - range.lo);
          return (
            <div
              key={`${n.time}-${i}`}
              className={`absolute rounded-full transition-colors duration-100 ${
                isActive
                  ? (isMatch ? 'bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.8)]' : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]')
                  : isPast ? 'bg-cyan-800/50' : 'bg-cyan-500/85'
              }`}
              style={{
                left: `${x1}%`,
                width: `${Math.max(x2 - x1, 0.8)}%`,
                top: `calc(${midiToY(m)}% - ${rowH * 0.42}%)`,
                height: `${rowH * 0.84}%`,
                minHeight: 6,
              }}
            />
          );
        })}

        {/* pitch trail */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
          {trailRef.current.length > 1 && (
            <polyline
              fill="none"
              stroke={isMatch ? 'rgba(74,222,128,0.75)' : 'rgba(103,232,249,0.65)'}
              strokeWidth="0.7"
              strokeLinecap="round"
              points={trailRef.current.map(p => `${timeToX(p.t)},${midiToY(p.m)}`).join(' ')}
            />
          )}
        </svg>

        {/* playhead */}
        <div className="absolute top-0 bottom-0 w-[2px] bg-yellow-400/90 shadow-[0_0_8px_rgba(250,204,21,0.7)]" style={{ left: `${PLAYHEAD_X}%` }} />

        {/* sung pitch dot */}
        {sungMidi !== null && (
          <div
            className={`absolute w-3.5 h-3.5 rounded-full -translate-x-1/2 -translate-y-1/2 ${
              isMatch ? 'bg-green-400 shadow-[0_0_12px_rgba(74,222,128,0.9)]' : 'bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.8)]'
            }`}
            style={{ left: `${PLAYHEAD_X}%`, top: `${midiToY(sungMidi)}%` }}
          />
        )}

        {/* legend */}
        <div className="absolute bottom-2 right-3 flex items-center gap-3 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-cyan-500/85 inline-block" />upcoming</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />sing now</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" />match</span>
        </div>
      </div>
    </div>
  );
};

export default KaraokeHighway;
