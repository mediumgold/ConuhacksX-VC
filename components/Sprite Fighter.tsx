import React, { useEffect, useRef, useState } from 'react';

interface FighterProps {
  side: 'left' | 'right';
  isAttacking: boolean;
  isDamaged: boolean;
  isComboAttacking?: boolean;
  comboCount?: number;
  hp: number;
  maxHp: number;
  name: string;
  score: number;
}

// ============ SPRITE CONFIG ============
// LuizMelo "Martial Hero" (Mack) & "Martial Hero 2" (Kenji) — free to use.
// Each animation is a horizontal strip of 200x200 frames.
// Mack natively faces RIGHT (player 1 / left side); Kenji faces LEFT (player 2).

const FRAME = 200; // px, square frames

interface AnimDef { file: string; frames: number; fps: number; holdLast?: boolean }
interface CharDef {
  base: string;
  scale: number;    // render scale of the 200px frame
  offsetX: number;  // px shift of the scaled frame inside the box (tune to center character)
  offsetY: number;
  anims: Record<string, AnimDef>;
}

const CHARACTERS: Record<'left' | 'right', CharDef> = {
  left: {
    base: '/sprites/samuraiMack',
    scale: 2.0, offsetX: -112, offsetY: -92,
    anims: {
      idle:    { file: 'Idle.png',    frames: 8, fps: 10 },
      attack1: { file: 'Attack1.png', frames: 6, fps: 14 },
      attack2: { file: 'Attack2.png', frames: 6, fps: 14 },
      jump:    { file: 'Jump.png',    frames: 2, fps: 8 },
      fall:    { file: 'Fall.png',    frames: 2, fps: 8 },
      takeHit: { file: 'TakeHit.png', frames: 4, fps: 12 },
      death:   { file: 'Death.png',   frames: 6, fps: 10, holdLast: true },
    },
  },
  right: {
    base: '/sprites/kenji',
    scale: 2.0, offsetX: -48, offsetY: -72,
    anims: {
      idle:    { file: 'Idle.png',    frames: 4, fps: 8 },
      attack1: { file: 'Attack1.png', frames: 4, fps: 12 },
      attack2: { file: 'Attack2.png', frames: 4, fps: 12 },
      jump:    { file: 'Jump.png',    frames: 2, fps: 8 },
      fall:    { file: 'Fall.png',    frames: 2, fps: 8 },
      takeHit: { file: 'TakeHit.png', frames: 3, fps: 12 },
      death:   { file: 'Death.png',   frames: 7, fps: 10, holdLast: true },
    },
  },
};

// ============ MOVES & TIERS ============
// A "move" maps combo state to one or more animation segments.
// 'leap' chains jump -> attack2 -> fall into a single aerial strike (Tier 3 special).

type Move = 'idle' | 'attack1' | 'attack2' | 'leap' | 'hit' | 'death';

interface Segment { anim: string; until: number } // play `anim` while progress < until

const MOVE_SCRIPT: Record<Move, Segment[]> = {
  idle:    [{ anim: 'idle', until: 1 }],
  attack1: [{ anim: 'attack1', until: 1 }],
  attack2: [{ anim: 'attack2', until: 1 }],
  leap:    [{ anim: 'jump', until: 0.22 }, { anim: 'attack2', until: 0.75 }, { anim: 'fall', until: 1 }],
  hit:     [{ anim: 'takeHit', until: 1 }],
  death:   [{ anim: 'death', until: 1 }],
};

function moveDuration(move: Move, char: CharDef): number {
  if (move === 'idle') return Infinity;
  // Sum segment lengths: each segment plays its full animation once
  return MOVE_SCRIPT[move].reduce((total, seg, i) => {
    const prev = i === 0 ? 0 : MOVE_SCRIPT[move][i - 1].until;
    const share = seg.until - prev;
    const anim = char.anims[seg.anim];
    // Segment duration derived from its animation's natural length, weighted by share
    return total + (anim.frames / anim.fps) * 1000 * (share > 0 ? 1 : 0);
  }, 0);
}

// Given move progress 0..1, which animation strip + frame to draw
function getFrame(move: Move, progress: number, char: CharDef, t: number): { anim: AnimDef; frame: number } {
  const script = MOVE_SCRIPT[move];
  if (move === 'idle') {
    const anim = char.anims.idle;
    const frame = Math.floor((t / 1000) * anim.fps) % anim.frames;
    return { anim, frame };
  }
  let segStart = 0;
  for (const seg of script) {
    if (progress <= seg.until || seg === script[script.length - 1]) {
      const anim = char.anims[seg.anim];
      const local = (progress - segStart) / (seg.until - segStart);
      let frame = Math.floor(Math.min(local, 0.999) * anim.frames);
      if (anim.holdLast && progress >= 1) frame = anim.frames - 1;
      return { anim, frame: Math.max(0, Math.min(frame, anim.frames - 1)) };
    }
    segStart = seg.until;
  }
  const anim = char.anims.idle;
  return { anim, frame: 0 };
}

// ============ TIER SYSTEM (unchanged from stick-figure version) ============
function tierOf(combo: number): 1 | 2 | 3 {
  if (combo >= 18) return 3;
  if (combo >= 8) return 2;
  return 1;
}

function pickMove(combo: number): Move {
  const tier = tierOf(combo);
  const r = Math.random();
  if (tier === 1) return 'attack1';
  if (tier === 2) return r < 0.55 ? 'attack1' : 'attack2';
  if (r < 0.4) return 'leap';
  if (r < 0.8) return 'attack2';
  return 'attack1';
}

// ============ COMPONENT ============
const SpriteFighter: React.FC<FighterProps> = ({
  side, isAttacking, isDamaged, comboCount = 0, hp, maxHp, name, score,
}) => {
  const isLeft = side === 'left';
  const char = CHARACTERS[side];
  const hpPercent = maxHp > 0 ? (hp / maxHp) * 100 : 0;

  const [display, setDisplay] = useState<{ anim: AnimDef; frame: number }>(
    () => ({ anim: char.anims.idle, frame: 0 })
  );
  const moveRef = useRef<Move>('idle');
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const comboRef = useRef<number>(comboCount);
  const deadRef = useRef<boolean>(false);

  const prevAttack = useRef(false);
  const prevDamage = useRef(false);

  useEffect(() => { comboRef.current = comboCount; }, [comboCount]);

  // Preload all strips once
  useEffect(() => {
    Object.values(char.anims).forEach(a => { const img = new Image(); img.src = `${char.base}/${a.file}`; });
  }, [char]);

  const trigger = (m: Move) => { moveRef.current = m; startRef.current = performance.now(); };

  // KO: death animation wins over everything, plays once, holds
  useEffect(() => {
    if (hp <= 0 && !deadRef.current) { deadRef.current = true; trigger('death'); }
    if (hp > 0 && deadRef.current) { deadRef.current = false; trigger('idle'); } // rematch/reset
  }, [hp]);

  useEffect(() => {
    if (deadRef.current) return;
    if (isDamaged && !prevDamage.current) {
      trigger('hit');
    } else if (isAttacking && !prevAttack.current && moveRef.current !== 'hit') {
      trigger(pickMove(comboRef.current));
    }
    prevAttack.current = isAttacking;
    prevDamage.current = isDamaged;
  }, [isAttacking, isDamaged]);

  useEffect(() => {
    const loop = (now: number) => {
      const move = moveRef.current;
      const dur = moveDuration(move, char);
      const elapsed = now - startRef.current;
      let progress = dur === Infinity ? 0 : Math.min(elapsed / dur, 1);

      if (dur !== Infinity && elapsed >= dur && move !== 'death') {
        moveRef.current = 'idle'; startRef.current = now; progress = 0;
      }
      setDisplay(getFrame(moveRef.current, progress, char, now));
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [char]);

  const inHit = moveRef.current === 'hit';
  const tier = tierOf(comboCount);
  const scaled = FRAME * char.scale;

  return (
    <div className="flex flex-col items-center relative">
      <div className={`mb-2 w-48 ${isLeft ? 'text-left' : 'text-right'}`}>
        <p className="text-3xl md:text-4xl font-black text-white">{score.toString().padStart(5, '0')}</p>
      </div>

      <div className={`mb-1 w-48 ${isLeft ? 'text-left' : 'text-right'}`}>
        <p className="text-sm font-bold uppercase tracking-widest text-yellow-400 mb-1">{name}</p>
        <div className="w-full h-4 bg-gray-800 border-2 border-white overflow-hidden rounded-full">
          <div className={`h-full transition-all duration-300 ${hpPercent > 50 ? 'bg-green-500' : hpPercent > 20 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${hpPercent}%` }} />
        </div>
      </div>

      <div className={`mb-3 w-48 ${isLeft ? 'text-left' : 'text-right'}`}>
        <div className="flex items-center gap-2" style={{ flexDirection: isLeft ? 'row' : 'row-reverse' }}>
          <span className={`text-xs font-bold ${tier === 3 ? 'text-amber-400' : tier === 2 ? 'text-purple-400' : 'text-teal-400'}`}>T{tier}</span>
          <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full transition-all duration-200 ${tier === 3 ? 'bg-amber-400' : tier === 2 ? 'bg-purple-400' : 'bg-teal-400'}`}
              style={{ width: `${Math.min(comboCount / 24 * 100, 100)}%` }} />
          </div>
        </div>
      </div>

      {/* Sprite viewport */}
      <div className={`w-40 h-64 relative overflow-hidden border-4 rounded-xl ${inHit ? 'border-red-500 bg-red-900/50' : 'border-cyan-500 bg-cyan-900/20'}`}>
        <div
          style={{
            position: 'absolute',
            left: char.offsetX,
            top: char.offsetY,
            width: scaled,
            height: scaled,
            backgroundImage: `url(${char.base}/${display.anim.file})`,
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${display.anim.frames * scaled}px ${scaled}px`,
            backgroundPosition: `-${display.frame * scaled}px 0px`,
            imageRendering: 'pixelated',
          }}
        />
        {inHit && (
          <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center pointer-events-none">
            <span className="text-4xl font-black text-red-500 animate-ping">HIT!</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SpriteFighter;
