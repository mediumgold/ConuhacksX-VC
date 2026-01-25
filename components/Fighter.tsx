
import React from 'react';

interface FighterProps {
  side: 'left' | 'right';
  isAttacking: boolean;
  isDamaged: boolean;
  hp: number;
  maxHp: number;
  name: string;
  score: number;
}

const Fighter: React.FC<FighterProps> = ({ side, isAttacking, isDamaged, hp, maxHp, name, score }) => {
  const isLeft = side === 'left';
  const hpPercent = maxHp > 0 ? (hp / maxHp) * 100 : 0;
  
  return (
    <div className={`flex flex-col items-center relative transition-transform duration-200 ${
      isAttacking ? (isLeft ? 'translate-x-20 scale-110' : '-translate-x-20 scale-110') : ''
    } ${isDamaged ? 'animate-bounce' : ''}`}>
      
      {/* Score above health bar */}
      <div className={`mb-2 w-48 ${isLeft ? 'text-left' : 'text-right'}`}>
        <p className="text-3xl md:text-4xl font-black text-white">{score.toString().padStart(5, '0')}</p>
      </div>
      
      {/* Name and Health Bar */}
      <div className={`mb-4 w-48 ${isLeft ? 'text-left' : 'text-right'}`}>
        <p className="text-sm font-bold uppercase tracking-widest text-yellow-400 mb-1">{name}</p>
        <div className="w-full h-4 bg-gray-800 border-2 border-white overflow-hidden rounded-full">
          <div 
            className={`h-full transition-all duration-300 ${hpPercent > 50 ? 'bg-green-500' : hpPercent > 20 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${hpPercent}%` }}
          />
        </div>
      </div>

      {/* Fighter Sprite Placeholder */}
      <div className={`w-40 h-64 relative flex items-center justify-center border-4 ${isDamaged ? 'border-red-500 bg-red-900/50' : 'border-cyan-500 bg-cyan-900/20'} rounded-xl`}>
        {/* Simple stylized SVG for a fighter */}
        <svg viewBox="0 0 100 150" className="w-full h-full p-4">
          <circle cx="50" cy="30" r="15" fill={isDamaged ? "#ff0000" : "#ffffff"} />
          <rect x="35" y="50" width="30" height="50" rx="5" fill={isDamaged ? "#ff0000" : "#ffffff"} />
          <path d={`M35 55 L${isAttacking ? (isLeft ? '80 40' : '10 40') : '20 80'}`} stroke={isDamaged ? "#ff0000" : "#ffffff"} strokeWidth="8" />
          <path d={`M65 55 L${isAttacking ? (isLeft ? '90 60' : '0 60') : '80 80'}`} stroke={isDamaged ? "#ff0000" : "#ffffff"} strokeWidth="8" />
          <path d="M40 100 L30 140" stroke={isDamaged ? "#ff0000" : "#ffffff"} strokeWidth="8" />
          <path d="M60 100 L70 140" stroke={isDamaged ? "#ff0000" : "#ffffff"} strokeWidth="8" />
        </svg>

        {/* Damage Indicator */}
        {isDamaged && (
          <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
            <span className="text-4xl font-black text-red-500 animate-ping">CRITICAL!</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Fighter;
