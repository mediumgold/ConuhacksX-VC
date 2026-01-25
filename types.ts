// ============ GAME STATE ============
export enum GamePhase {
  LOBBY = 'LOBBY',
  COUNTDOWN = 'COUNTDOWN',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER'
}

export type PlayerSlot = 1 | 2;

// ============ LOBBY STATE ============
export interface LobbyState {
  p1Connected: boolean;
  p2Connected: boolean;
  p1Ready: boolean;
  p2Ready: boolean;
  hostConnected: boolean;
}

// ============ PLAYER STATE ============
export interface PlayerState {
  slot: PlayerSlot;
  hp: number;
  maxHp: number;
  score: number;
  totalAccuracy: number;
  notesHit: number;
  notesMissed: number;
  isAttacking: boolean;
  isDamaged: boolean;
  currentPitch: number;
  name: string;
  damageAccumulator: number;  // Accumulated damage (2 per hit)
  comboCount: number;         // Notes hit in current combo
  isComboAttacking: boolean;  // True when combo attack animation should play
}

// ============ GAME STATE ============
export interface GameState {
  phase: GamePhase;
  currentTime: number;
  songDuration: number;
  currentSegment: 1 | 2 | 3 | 4;
  attackingPlayer: PlayerSlot;
  player1: PlayerState;
  player2: PlayerState;
  winner: PlayerSlot | 'tie' | null;
}

// ============ MIDI / NOTES ============
export interface MidiNote {
  time: number;        // Seconds from start
  pitch: number;       // Frequency in Hz
  midiNumber: number;  // MIDI note number (0-127)
  duration: number;    // Duration in seconds
  velocity: number;    // 0-127
}

export interface Note {
  time: number;
  pitch: number;
  duration: number;
  lyrics: string;
}

// ============ LRC LYRICS ============
export interface LrcLine {
  time: number;  // Seconds
  text: string;
}

// ============ SONG CONFIG ============
export interface SongConfig {
  title: string;
  artist: string;
  youtubeId: string;
  duration: number;
  midiNotes: MidiNote[];
  lyrics: LrcLine[];
}

// ============ SOCKET EVENTS ============

// Client -> Server
export interface ClientJoinPayload {
  type: 'host' | 'player';
  requestedSlot?: PlayerSlot;
}

export interface PlayerReadyPayload {
  slot: PlayerSlot;
}

export interface PitchDataPayload {
  slot: PlayerSlot;
  pitch: number;
  timestamp: number;
  volume: number;
}

export interface HostStartGamePayload {
  songConfig: SongConfig;
}

// Server -> Client
export interface PlayerAssignedPayload {
  slot: PlayerSlot;
}

export interface LobbyUpdatePayload extends LobbyState {}

export interface GameStartPayload {
  startTimestamp: number;
  songConfig: SongConfig;
}

export interface PitchUpdatePayload {
  slot: PlayerSlot;
  pitch: number;
  timestamp: number;
}

export interface GameStateUpdatePayload extends GameState {}

export interface GameOverPayload {
  winner: PlayerSlot | 'tie';
  player1Score: number;
  player2Score: number;
  player1Accuracy: number;
  player2Accuracy: number;
}

// ============ LEGACY COMPAT ============
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
