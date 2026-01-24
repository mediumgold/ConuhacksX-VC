import { GamePhase } from '../types';
import type { PlayerSlot, PlayerState, GameState, MidiNote } from '../types';
import { getNoteAtTime } from './midiParser';

// ============ CONSTANTS ============
export const MAX_HP = 100;
export const BASE_DAMAGE = 5;
export const MAX_BONUS_DAMAGE = 15;
export const PERFECT_THRESHOLD_CENTS = 10;
export const GOOD_THRESHOLD_CENTS = 25;
export const OK_THRESHOLD_CENTS = 50;

// ============ PITCH ACCURACY ============

// Calculate cents difference between two frequencies
export function calculateCentsDiff(expected: number, actual: number): number {
  if (actual <= 0 || expected <= 0) return Infinity;
  return 1200 * Math.log2(actual / expected);
}

// Calculate accuracy score (0-1) based on pitch difference
export function calculatePitchAccuracy(expectedPitch: number, actualPitch: number): number {
  if (actualPitch <= 0) return 0;
  
  const centsDiff = Math.abs(calculateCentsDiff(expectedPitch, actualPitch));
  
  // Perfect: 0-10 cents = 1.0
  if (centsDiff <= PERFECT_THRESHOLD_CENTS) {
    return 1.0;
  }
  
  // Good: 10-25 cents = 0.7-1.0
  if (centsDiff <= GOOD_THRESHOLD_CENTS) {
    return 1.0 - (centsDiff - PERFECT_THRESHOLD_CENTS) / (GOOD_THRESHOLD_CENTS - PERFECT_THRESHOLD_CENTS) * 0.3;
  }
  
  // OK: 25-50 cents = 0.3-0.7
  if (centsDiff <= OK_THRESHOLD_CENTS) {
    return 0.7 - (centsDiff - GOOD_THRESHOLD_CENTS) / (OK_THRESHOLD_CENTS - GOOD_THRESHOLD_CENTS) * 0.4;
  }
  
  // Miss: >50 cents = 0
  return 0;
}

// ============ DAMAGE CALCULATION ============

export function calculateDamage(accuracy: number): number {
  // accuracy 0-1
  // Perfect (1.0) = 20 damage
  // Good (0.7) = 15.5 damage  
  // OK (0.3) = 9.5 damage
  // Miss (0) = 0 damage
  if (accuracy <= 0) return 0;
  return BASE_DAMAGE + (MAX_BONUS_DAMAGE * accuracy);
}

// ============ SEGMENT LOGIC ============

export function getCurrentSegment(currentTime: number, songDuration: number): {
  segment: 1 | 2 | 3 | 4;
  attacker: PlayerSlot;
} {
  if (songDuration <= 0) {
    return { segment: 1, attacker: 1 };
  }
  
  const segmentDuration = songDuration / 4;
  const segmentIndex = Math.floor(currentTime / segmentDuration);
  const segment = Math.min(4, Math.max(1, segmentIndex + 1)) as 1 | 2 | 3 | 4;
  
  // Segment 1 & 3 = Player 1 attacks
  // Segment 2 & 4 = Player 2 attacks
  const attacker: PlayerSlot = (segment === 1 || segment === 3) ? 1 : 2;
  
  return { segment, attacker };
}

// ============ PLAYER STATE ============

export function createInitialPlayerState(slot: PlayerSlot, name: string): PlayerState {
  return {
    slot,
    hp: MAX_HP,
    maxHp: MAX_HP,
    score: 0,
    totalAccuracy: 0,
    notesHit: 0,
    notesMissed: 0,
    isAttacking: false,
    isDamaged: false,
    currentPitch: -1,
    name
  };
}

// ============ GAME STATE ============

export function createInitialGameState(songDuration: number): GameState {
  return {
    phase: GamePhase.LOBBY,
    currentTime: 0,
    songDuration,
    currentSegment: 1,
    attackingPlayer: 1,
    player1: createInitialPlayerState(1, 'Player 1'),
    player2: createInitialPlayerState(2, 'Player 2'),
    winner: null
  };
}

// ============ GAME TICK ============

export interface TickResult {
  gameState: GameState;
  p1Damage: number;
  p2Damage: number;
  p1Accuracy: number;
  p2Accuracy: number;
}

export function processGameTick(
  gameState: GameState,
  midiNotes: MidiNote[],
  p1Pitch: number,
  p2Pitch: number,
  currentTime: number
): TickResult {
  const newState = { ...gameState };
  newState.currentTime = currentTime;
  
  // Update segment
  const { segment, attacker } = getCurrentSegment(currentTime, gameState.songDuration);
  newState.currentSegment = segment;
  newState.attackingPlayer = attacker;
  
  // Get current note
  const currentNote = getNoteAtTime(midiNotes, currentTime);
  
  let p1Damage = 0;
  let p2Damage = 0;
  let p1Accuracy = 0;
  let p2Accuracy = 0;
  
  // Update player pitches
  newState.player1 = { ...newState.player1, currentPitch: p1Pitch };
  newState.player2 = { ...newState.player2, currentPitch: p2Pitch };
  
  if (currentNote) {
    // Calculate accuracy for both players
    p1Accuracy = calculatePitchAccuracy(currentNote.pitch, p1Pitch);
    p2Accuracy = calculatePitchAccuracy(currentNote.pitch, p2Pitch);
    
    // Only attacking player deals damage
    if (attacker === 1 && p1Accuracy > 0) {
      p2Damage = calculateDamage(p1Accuracy);
      newState.player1 = {
        ...newState.player1,
        isAttacking: true,
        score: newState.player1.score + Math.round(p1Accuracy * 100),
        totalAccuracy: newState.player1.totalAccuracy + p1Accuracy,
        notesHit: newState.player1.notesHit + 1
      };
      newState.player2 = {
        ...newState.player2,
        isDamaged: true,
        hp: Math.max(0, newState.player2.hp - p2Damage)
      };
    } else if (attacker === 2 && p2Accuracy > 0) {
      p1Damage = calculateDamage(p2Accuracy);
      newState.player2 = {
        ...newState.player2,
        isAttacking: true,
        score: newState.player2.score + Math.round(p2Accuracy * 100),
        totalAccuracy: newState.player2.totalAccuracy + p2Accuracy,
        notesHit: newState.player2.notesHit + 1
      };
      newState.player1 = {
        ...newState.player1,
        isDamaged: true,
        hp: Math.max(0, newState.player1.hp - p1Damage)
      };
    }
  }
  
  // Check win conditions
  if (newState.player1.hp <= 0) {
    newState.phase = GamePhase.GAME_OVER;
    newState.winner = 2;
  } else if (newState.player2.hp <= 0) {
    newState.phase = GamePhase.GAME_OVER;
    newState.winner = 1;
  } else if (currentTime >= gameState.songDuration) {
    newState.phase = GamePhase.GAME_OVER;
    // Determine winner by score
    if (newState.player1.score > newState.player2.score) {
      newState.winner = 1;
    } else if (newState.player2.score > newState.player1.score) {
      newState.winner = 2;
    } else {
      // Tie-breaker: accuracy percentage
      const p1AccPct = newState.player1.notesHit > 0 
        ? newState.player1.totalAccuracy / newState.player1.notesHit 
        : 0;
      const p2AccPct = newState.player2.notesHit > 0 
        ? newState.player2.totalAccuracy / newState.player2.notesHit 
        : 0;
      
      if (p1AccPct > p2AccPct) {
        newState.winner = 1;
      } else if (p2AccPct > p1AccPct) {
        newState.winner = 2;
      } else {
        newState.winner = 'tie';
      }
    }
  }
  
  return {
    gameState: newState,
    p1Damage,
    p2Damage,
    p1Accuracy,
    p2Accuracy
  };
}

// Reset attack/damage animations after a short delay
export function resetAnimationFlags(gameState: GameState): GameState {
  return {
    ...gameState,
    player1: { ...gameState.player1, isAttacking: false, isDamaged: false },
    player2: { ...gameState.player2, isAttacking: false, isDamaged: false }
  };
}
