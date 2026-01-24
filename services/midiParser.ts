import type { MidiNote } from '../types';

// MIDI note number to frequency conversion
export function midiToFrequency(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

// Frequency to MIDI note number
export function frequencyToMidi(frequency: number): number {
  return Math.round(12 * Math.log2(frequency / 440) + 69);
}

// Parse MIDI file ArrayBuffer into MidiNote array
export async function parseMidiFile(arrayBuffer: ArrayBuffer): Promise<MidiNote[]> {
  const data = new Uint8Array(arrayBuffer);
  const notes: MidiNote[] = [];
  
  // Simple MIDI parser for single-track files
  // Format: MThd header + MTrk track(s)
  
  let pos = 0;
  
  // Read header
  const headerChunk = readChunkHeader(data, pos);
  if (headerChunk.type !== 'MThd') {
    throw new Error('Invalid MIDI file: missing MThd header');
  }
  pos += 8;
  
  const format = (data[pos] << 8) | data[pos + 1];
  const numTracks = (data[pos + 2] << 8) | data[pos + 3];
  const timeDivision = (data[pos + 4] << 8) | data[pos + 5];
  pos += headerChunk.length;
  
  // Ticks per quarter note (assuming no SMPTE)
  const ticksPerBeat = timeDivision & 0x7FFF;
  let microsecondsPerBeat = 500000; // Default 120 BPM
  
  // Track active notes for duration calculation
  const activeNotes: Map<number, { startTime: number; velocity: number }> = new Map();
  
  // Process tracks
  for (let track = 0; track < numTracks; track++) {
    const trackChunk = readChunkHeader(data, pos);
    if (trackChunk.type !== 'MTrk') {
      pos += 8 + trackChunk.length;
      continue;
    }
    pos += 8;
    
    const trackEnd = pos + trackChunk.length;
    let currentTick = 0;
    let runningStatus = 0;
    
    while (pos < trackEnd) {
      // Read delta time
      const { value: deltaTime, bytesRead } = readVariableLength(data, pos);
      pos += bytesRead;
      currentTick += deltaTime;
      
      // Current time in seconds
      const currentTime = (currentTick / ticksPerBeat) * (microsecondsPerBeat / 1000000);
      
      // Read event
      let eventType = data[pos];
      
      if (eventType < 0x80) {
        // Running status
        eventType = runningStatus;
      } else {
        pos++;
        if (eventType < 0xF0) {
          runningStatus = eventType;
        }
      }
      
      const channel = eventType & 0x0F;
      const messageType = eventType & 0xF0;
      
      if (messageType === 0x90) {
        // Note On
        const note = data[pos++];
        const velocity = data[pos++];
        
        if (velocity > 0) {
          activeNotes.set(note, { startTime: currentTime, velocity });
        } else {
          // Note On with velocity 0 = Note Off
          const activeNote = activeNotes.get(note);
          if (activeNote) {
            notes.push({
              time: activeNote.startTime,
              pitch: midiToFrequency(note),
              midiNumber: note,
              duration: currentTime - activeNote.startTime,
              velocity: activeNote.velocity
            });
            activeNotes.delete(note);
          }
        }
      } else if (messageType === 0x80) {
        // Note Off
        const note = data[pos++];
        pos++; // velocity (ignored)
        
        const activeNote = activeNotes.get(note);
        if (activeNote) {
          notes.push({
            time: activeNote.startTime,
            pitch: midiToFrequency(note),
            midiNumber: note,
            duration: currentTime - activeNote.startTime,
            velocity: activeNote.velocity
          });
          activeNotes.delete(note);
        }
      } else if (messageType === 0xA0) {
        // Polyphonic aftertouch
        pos += 2;
      } else if (messageType === 0xB0) {
        // Control change
        pos += 2;
      } else if (messageType === 0xC0) {
        // Program change
        pos += 1;
      } else if (messageType === 0xD0) {
        // Channel aftertouch
        pos += 1;
      } else if (messageType === 0xE0) {
        // Pitch bend
        pos += 2;
      } else if (eventType === 0xFF) {
        // Meta event
        const metaType = data[pos++];
        const { value: metaLength, bytesRead: metaLenBytes } = readVariableLength(data, pos);
        pos += metaLenBytes;
        
        if (metaType === 0x51) {
          // Tempo change
          microsecondsPerBeat = (data[pos] << 16) | (data[pos + 1] << 8) | data[pos + 2];
        }
        
        pos += metaLength;
      } else if (eventType === 0xF0 || eventType === 0xF7) {
        // SysEx
        const { value: sysexLength, bytesRead: sysexLenBytes } = readVariableLength(data, pos);
        pos += sysexLenBytes + sysexLength;
      }
    }
  }
  
  // Sort by time
  notes.sort((a, b) => a.time - b.time);
  
  return notes;
}

function readChunkHeader(data: Uint8Array, pos: number): { type: string; length: number } {
  const type = String.fromCharCode(data[pos], data[pos + 1], data[pos + 2], data[pos + 3]);
  const length = (data[pos + 4] << 24) | (data[pos + 5] << 16) | (data[pos + 6] << 8) | data[pos + 7];
  return { type, length };
}

function readVariableLength(data: Uint8Array, pos: number): { value: number; bytesRead: number } {
  let value = 0;
  let bytesRead = 0;
  let byte: number;
  
  do {
    byte = data[pos + bytesRead];
    value = (value << 7) | (byte & 0x7F);
    bytesRead++;
  } while (byte & 0x80);
  
  return { value, bytesRead };
}

// Get the note that should be sung at a given time
export function getNoteAtTime(notes: MidiNote[], time: number): MidiNote | null {
  for (const note of notes) {
    if (time >= note.time && time <= note.time + note.duration) {
      return note;
    }
  }
  return null;
}

// Get notes within a time window (for visualization)
export function getNotesInWindow(notes: MidiNote[], startTime: number, endTime: number): MidiNote[] {
  return notes.filter(note => 
    (note.time >= startTime && note.time <= endTime) ||
    (note.time + note.duration >= startTime && note.time <= endTime)
  );
}
