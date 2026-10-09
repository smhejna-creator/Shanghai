import type { Meld, RuleSet } from '@/engine/index.ts';
import { isWild, runCardValue } from '@/engine/index.ts';
import { CardView } from './CardView';

const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣', X: '' } as const;
const RANK_NAME: Record<string, string> = { A: 'Aces', J: 'Jacks', Q: 'Queens', K: 'Kings' };
const SUIT_NAME = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs', X: '' } as const;

export function meldTitle(meld: Meld): string {
  if (meld.kind === 'set') return `Set of ${RANK_NAME[meld.rank] ?? `${meld.rank}s`}`;
  const lo = meld.cards.length ? runCardValue(meld, 0).rank : '';
  const hi = meld.cards.length ? runCardValue(meld, meld.cards.length - 1).rank : '';
  return `Run ${lo}–${hi} of ${SUIT_NAME[meld.suit]}`;
}

interface Props {
  meld: Meld;
  ruleSet: RuleSet;
  ownerName: string;
  showOwner?: boolean;
  highlight?: boolean;
  onTap?: () => void;
  onTapCard?: (cardId: string) => void;
}

export function MeldView({ meld, ruleSet, ownerName, showOwner = true, highlight, onTap, onTapCard }: Props) {
  const red = meld.kind === 'run' && (meld.suit === 'H' || meld.suit === 'D');
  return (
    <div
      className={`shrink-0 rounded-xl border p-2 transition ${highlight ? 'border-gold bg-gold/10 shadow-glow' : 'border-white/10 bg-black/30'} ${onTap ? 'cursor-pointer active:bg-white/10' : ''}`}
      onClick={onTap}
    >
      <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] font-semibold text-white/70">
        <span className={red ? 'text-red-300' : ''}>
          {meldTitle(meld)}
          {meld.kind === 'run' && <span className="ml-1">{SUIT[meld.suit]}</span>}
        </span>
        {showOwner && <span className="truncate text-[10px] uppercase tracking-wider text-white/40">{ownerName}</span>}
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
