import type { PublicPlayer, RuleSet } from '@/engine/index.ts';

export function Scoreboard({ players, ruleSet, upToRound }: { players: PublicPlayer[]; ruleSet: RuleSet; upToRound: number }) {
  const totals = players.map((p) => p.scores.slice(0, upToRound + 1).reduce((a, b) => a + (b ?? 0), 0));
  const best = Math.min(...totals);
  return (
    <div className="overflow-x-auto rounded-xl bg-black/30">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-white/60">
            <th className="p-2">Player</th>
            {ruleSet.rounds.slice(0, upToRound + 1).map((r, i) => (
              <th key={r.id} className="p-2 text-center" title={r.name}>
                R{i + 1}
              </th>
            ))}
            <th className="p-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => (
            <tr key={p.seat} className={`border-t border-white/10 ${totals[i] === best ? 'text-amber-300' : ''}`}>
              <td className="p-2 font-semibold">{p.name}</td>
              {ruleSet.rounds.slice(0, upToRound + 1).map((r, ri) => (
                <td key={r.id} className="p-2 text-center tabular-nums">
                  {p.scores[ri] ?? '–'}
                </td>
              ))}
              <td className="p-2 text-right font-bold tabular-nums">{totals[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
