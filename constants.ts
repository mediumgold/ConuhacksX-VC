
import { Song } from './types';

// Standard chromatic scale pitches (A4 = 440Hz)
export const PITCHES = {
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.00,
  A4: 440.00,
  B4: 493.88,
  C5: 523.25
};

export const SONGS: Song[] = [
  {
    id: 'boss-theme-1',
    title: 'The Vocal Crusader',
    artist: 'Gemini Beats',
    difficulty: 'Easy',
    notes: [
      { time: 2, pitch: PITCHES.C4, duration: 1, lyrics: "FIGHT" },
      { time: 4, pitch: PITCHES.E4, duration: 1, lyrics: "YOUR" },
      { time: 6, pitch: PITCHES.G4, duration: 1, lyrics: "WAY" },
      { time: 8, pitch: PITCHES.C5, duration: 1, lyrics: "TO" },
      { time: 10, pitch: PITCHES.A4, duration: 1, lyrics: "GLO-RY!" },
      { time: 13, pitch: PITCHES.G4, duration: 2, lyrics: "OOH" },
      { time: 16, pitch: PITCHES.F4, duration: 1, lyrics: "NE-VER" },
      { time: 18, pitch: PITCHES.D4, duration: 1, lyrics: "GIVE" },
      { time: 20, pitch: PITCHES.C4, duration: 2, lyrics: "UP!" },
    ]
  }
];

export const HP_DAMAGE = 10;
export const WIN_MESSAGE = "VICTORY! YOUR VOICE IS SUPREME.";
export const LOSE_MESSAGE = "DEFEAT. TIME TO HIT THE VOCAL COACH.";
