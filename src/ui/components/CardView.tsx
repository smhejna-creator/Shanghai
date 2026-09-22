import type { Card, RuleSet } from '@/engine/index.ts';
import { isWild } from '@/engine/index.ts';

const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣', X: '' } as const;

interface Props {
  card: Card;
  ruleSet: RuleSet;
  selected?: boolean;
  size?: 'xs' | 'sm' | 'md';
  faceDown?: boolean;
  standsFor?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  dim?: boolean;
}

const SIZES = {
  xs: { box: 'w-7 h-10 rounded-[4px]', idx: 'text-[9px] leading-none', pip: 'text-sm', pad: 'p-0.5' },
  sm: { box: 'w-10 h-14 rounded-md', idx: 'text-[11px] leading-none', pip: 'text-xl', pad: 'p-1' },
  md: { box: 'w-[60px] h-[86px] rounded-lg', idx: 'text-[13px] leading-none', pip: 'text-3xl', pad: 'p-1.5' },
};

export function CardView({ card, ruleSet, selected, size = 'md', faceDown, standsFor, onClick, className = '', dim }: Props) {
  const S = SIZES[size];
  if (faceDown) return <div className={`card-back ${S.box} ${className}`} />;
  const wild = isWild(card, ruleSet);
  const red = card.suit === 'H' || card.suit === 'D';
  const joker = card.rank === 'JOKER';
  const color = joker ? 'text-purple-700' : red ? 'text-red-600' : 'text-gray-900';
  const index = joker ? 'J' : card.rank;
  const pip = joker ? '★' : SUIT[card.suit];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`card-face relative shrink-0 select-none ${S.box} ${color} transition-transform duration-150 ${
        selected ? '-translate-y-3 ring-2 ring-gold shadow-glow' : ''
      } ${wild ? 'ring-1 ring-gold/80' : ''} ${dim ? 'opacity-60' : ''} ${className}`}
    >
      <div className={`absolute left-0 top-0 flex flex-col items-center font-bold ${S.pad} ${S.idx}`}>
        <span>{index}</span>
        <span className="-mt-px">{pip}</span>
      </div>
      <div className={`absolute bottom-0 right-0 flex rotate-180 flex-col items-center font-bold ${S.pad} ${S.idx}`}>
        <span>{index}</span>
        <span className="-mt-px">{pip}</span>
      </div>
      {size !== 'xs' && (
        <div className={`absolute inset-0 flex items-center justify-center ${S.pip} ${joker ? 'drop-shadow-[0_0_4px_rgba(147,51,234,0.6)]' : ''}`}>
          {joker ? '🃏' : ['J', 'Q', 'K'].includes(card.rank) ? <span className="font-display text-2xl font-bold">{card.rank}</span> : pip}
        </div>
      )}
      {wild && size !== 'xs' && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-3 rounded-full bg-gold px-1 text-[8px] font-bold uppercase tracking-wider text-ink">wild</div>
      )}
      {standsFor && <div className="absolute -right-1 -top-1 rounded-full bg-gold px-1.5 py-0.5 text-[9px] font-extrabold text-ink shadow">{standsFor}</div>}
    </button>
  );
}

/** A small stack of face-down cards suggesting a pile. */
export function CardStack({ count, size = 'md', onClick, disabled }: { count: number; size?: 'sm' | 'md'; onClick?: () => void; disabled?: boolean }) {
  const layers = Math.min(4, Math.max(1, Math.ceil(count / 20)));
  const box = SIZES[size].box;
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`relative ${box} disabled:opacity-60`}>
      {Array.from({ length: layers }, (_, i) => (
        <div key={i} className={`card-back absolute inset-0 ${box}`} style={{ transform: `translate(${-i * 1.5}px, ${-i * 1.5}px)` }} />
      ))}
      {count === 0 && <div className={`absolute inset-0 ${box} border border-dashed border-white/30`} />}
    </button>
  );
}
