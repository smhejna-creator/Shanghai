import type { Meld, RuleSet } from '@/engine/index.ts';
import { isWild, runCardValue } from '@/engine/index.ts';
import { CardView } from './CardView';

const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣', X: '' } as const;

interface Props {
  meld: Meld;
  ruleSet: RuleSet;
  ownerName: string;
  highlight?: boolean;
  onTap?: () => void;
  onTapCard?: (cardId: string) => void;
}

export function MeldView({ meld, ruleSet, ownerName, highlight, onTap, onTapCard }: Props) {
  const red = meld.kind === 'run' && (meld.suit === 'H' || meld.suit === 'D');
  return (
    <div
      className={`shrink-0 rounded-xl border p-2 transition ${highlight ? 'border-gold bg-gold/10 shadow-glow' : 'border-white/10 bg-black/30'} ${onTap ? 'cursor-pointer active:bg-white/10' : ''}`}
      onClick={onTap}
    >
      <div className="mb-1.5 flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-wider text-white/60">
        <span>
          {meld.kind === 'set' ? `${meld.rank}s` : <span className={red ? 'text-red-400' : ''}>run {SUIT[meld.suit]}</span>}
        </span>
        <span className="truncate text-white/40">{ownerName}</span>
      </div>
      <div className="flex">
        {meld.cards.map((c, i) => {
          const wild = isWild(c, ruleSet);
          const standsFor = meld.kind === 'run' && wild ? runCardValue(meld, i).rank : undefined;
          return (
            <div key={c.id} className="-ml-4 first:ml-0" style={{ zIndex: i }}>
              <CardView card={c} ruleSet={ruleSet} size="sm" standsFor={standsFor} onClick={onTapCard ? (e) => { e.stopPropagation(); onTapCard(c.id); } : undefined} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
