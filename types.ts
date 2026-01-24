
export enum GameState {
  IDLE = 'IDLE',
  CALIBRATING = 'CALIBRATING',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER'
}

export interface Note {
  time: number;      // Seconds from start
  pitch: number;     // Frequency in Hz
  duration: number;  // Duration in seconds
  lyrics: string;
}

export interface FighterStats {
  hp: number;
  maxHp: number;
  name: string;
  isAttacking: boolean;
  isDamaged: boolean;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  notes: Note[];
}
