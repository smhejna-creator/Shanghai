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
  return (
    <div
      className={`rounded-lg border p-1.5 ${highlight ? 'border-sky-400 bg-sky-400/10' : 'border-white/10 bg-black/20'} ${onTap ? 'cursor-pointer active:bg-white/10' : ''}`}
      onClick={onTap}
    >
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-white/60">
        <span>{meld.kind === 'set' ? `Set of ${meld.rank}s` : `Run ${SUIT[meld.suit]}`}</span>
        <span>{ownerName}</span>
      </div>
      <div className="flex">
        {meld.cards.map((c, i) => {
          const wild = isWild(c, ruleSet);
          const standsFor = meld.kind === 'run' && wild ? runCardValue(meld, i).rank : undefined;
          return (
            <div key={c.id} className="-ml-3 first:ml-0">
              <CardView
                card={c}
                ruleSet={ruleSet}
                small
                standsFor={standsFor}
                onClick={
                  onTapCard
                    ? () => {
                        onTapCard(c.id);
                      }
                    : undefined
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
