import type { Card, RuleSet } from '@/engine/index.ts';
import { isWild } from '@/engine/index.ts';

const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣', X: '★' } as const;

interface Props {
  card: Card;
  ruleSet: RuleSet;
  selected?: boolean;
  small?: boolean;
  faceDown?: boolean;
  standsFor?: string;
  onClick?: () => void;
  className?: string;
}

export function CardView({ card, ruleSet, selected, small, faceDown, standsFor, onClick, className = '' }: Props) {
  const wild = isWild(card, ruleSet);
  const red = card.suit === 'H' || card.suit === 'D';
  const joker = card.rank === 'JOKER';
  const w = small ? 'w-9 h-[52px] text-xs' : 'w-14 h-20 text-base';
  if (faceDown) {
    return <div className={`${w} rounded-md bg-blue-900 border-2 border-white/70 bg-[repeating-linear-gradient(45deg,#1e3a8a_0_4px,#1e40af_4px_8px)] ${className}`} />;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${w} relative shrink-0 select-none rounded-md border bg-white text-left shadow-md transition-transform ${
        red ? 'text-red-600' : 'text-gray-900'
      } ${wild ? 'border-amber-400 ring-2 ring-amber-400/70' : 'border-gray-300'} ${selected ? '-translate-y-3 ring-2 ring-sky-400' : ''} ${className}`}
    >
      <div className={`absolute left-1 top-0.5 font-bold leading-tight ${joker ? 'text-purple-700' : ''}`}>
        {joker ? 'J★' : card.rank}
        {!joker && <div className="-mt-0.5">{SUIT[card.suit]}</div>}
      </div>
      {!small && !joker && <div className="absolute inset-0 flex items-center justify-center text-2xl opacity-80">{SUIT[card.suit]}</div>}
      {!small && joker && <div className="absolute inset-0 flex items-center justify-center text-2xl text-purple-700">🃏</div>}
      {standsFor && <div className="absolute bottom-0 right-0 rounded-tl bg-amber-400 px-1 text-[10px] font-bold text-black">{standsFor}</div>}
    </button>
  );
}
