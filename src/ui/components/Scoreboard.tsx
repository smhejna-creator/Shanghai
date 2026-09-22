import type { PublicPlayer, RuleSet } from '@/engine/index.ts';

const MEDALS = ['🥇', '🥈', '🥉'];

export function Scoreboard({ players, ruleSet, upToRound, final }: { players: PublicPlayer[]; ruleSet: RuleSet; upToRound: number; final?: boolean }) {
  const totals = players.map((p) => p.scores.slice(0, upToRound + 1).reduce((a, b) => a + (b ?? 0), 0));
  const ranked = players.map((p, i) => ({ p, total: totals[i] })).sort((a, b) => a.total - b.total);
  const rounds = ruleSet.rounds.slice(0, upToRound + 1);
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="label px-3 py-2.5">Player</th>
              {rounds.map((r, i) => (
                <th key={r.id} className="label px-2 py-2.5 text-center" title={r.name}>
                  R{i + 1}
                </th>
              ))}
              <th className="label px-3 py-2.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map(({ p, total }, rank) => (
              <tr key={p.seat} className={`border-b border-line/60 last:border-0 ${rank === 0 ? 'bg-gold/10' : ''}`}>
                <td className="px-3 py-2.5 font-semibold">
                  <span className="mr-1.5">{final ? MEDALS[rank] ?? '' : rank === 0 ? '👑' : ''}</span>
                  {p.isBot && '🤖 '}
                  {p.name}
                </td>
                {rounds.map((r, ri) => (
                  <td key={r.id} className="px-2 py-2.5 text-center tabular-nums text-white/80">
                    {p.scores[ri] ?? '–'}
                  </td>
                ))}
                <td className={`px-3 py-2.5 text-right font-extrabold tabular-nums ${rank === 0 ? 'text-gold' : ''}`}>{total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
