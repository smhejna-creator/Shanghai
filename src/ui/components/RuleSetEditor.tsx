import { useMemo, useState } from 'react';
import type { Contract, MeldRequirement, Rank, RuleSet } from '@/engine/index.ts';
import { PRESETS, RANKS, contractName, suggestedDecks, validateRuleSet } from '@/engine/index.ts';
import { Button } from './Button';

interface Props {
  value: RuleSet;
  onChange: (rs: RuleSet) => void;
  saved?: { id: string; name: string; ruleset: RuleSet }[];
  onSave?: (name: string) => Promise<void>;
  onDeleteSaved?: (id: string) => Promise<void>;
  playerCount?: number;
}

const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="flex flex-col gap-1">
    <span className="text-sm text-white/70">{label}</span>
    {children}
    {hint && <span className="text-xs text-white/50">{hint}</span>}
  </label>
);
const input = 'rounded-lg bg-white px-3 py-2 text-black';
const num = (v: number, set: (n: number) => void, min?: number, max?: number) => (
  <input type="number" inputMode="numeric" className={input} value={v} min={min} max={max} onChange={(e) => set(Number(e.target.value))} />
);

let contractSeq = 100;

export function RuleSetEditor({ value: rs, onChange, saved = [], onSave, onDeleteSaved, playerCount }: Props) {
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const problems = useMemo(() => validateRuleSet(rs), [rs]);
  const set = (patch: Partial<RuleSet>) => onChange({ ...rs, ...patch });

  const wildMode: 'jokers' | '2' | '10' | 'custom' =
    rs.wilds.ranks.length === 0 ? 'jokers' : rs.wilds.ranks.length === 1 && rs.wilds.ranks[0] === '2' ? '2' : rs.wilds.ranks.length === 1 && rs.wilds.ranks[0] === '10' ? '10' : 'custom';

  const updateRound = (i: number, patch: Partial<Contract>) => {
    const rounds = rs.rounds.map((r, j) => (j === i ? { ...r, ...patch } : r));
    set({ rounds });
  };
  const updateMeld = (i: number, mi: number, patch: Partial<MeldRequirement>) => {
    const melds = rs.rounds[i].melds.map((m, j) => (j === mi ? ({ ...m, ...patch } as MeldRequirement) : m));
    updateRound(i, { melds, name: contractName(melds) });
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rs.rounds.length) return;
    const rounds = rs.rounds.slice();
    [rounds[i], rounds[j]] = [rounds[j], rounds[i]];
    set({ rounds });
  };
  const addRound = () => {
    const melds: MeldRequirement[] = [{ kind: 'set', size: 3 }, { kind: 'set', size: 3 }];
    set({ rounds: [...rs.rounds, { id: `c${Date.now()}${contractSeq++}`, name: contractName(melds), melds, noDiscard: false }] });
  };

  const suggested = playerCount ? suggestedDecks(playerCount) : undefined;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button key={p.key} variant={rs.name === p.label ? 'primary' : 'secondary'} size="sm" onClick={() => onChange(p.build())}>
            {p.label}
          </Button>
        ))}
        {saved.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1">
            <Button variant={rs.name === s.name ? 'primary' : 'secondary'} size="sm" onClick={() => onChange({ ...s.ruleset, name: s.name })}>
              {s.name}
            </Button>
            {onDeleteSaved && (
              <button className="text-xs text-white/50 hover:text-red-300" title="Delete" onClick={() => onDeleteSaved(s.id)}>
                ✕
              </button>
            )}
          </span>
        ))}
      </section>

      <Field label="Rule set name">
        <input className={input} value={rs.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Min players">{num(rs.players.min, (n) => set({ players: { ...rs.players, min: n } }), 2, 6)}</Field>
        <Field label="Max players">{num(rs.players.max, (n) => set({ players: { ...rs.players, max: n } }), 2, 6)}</Field>
        <Field label="Decks" hint={suggested && suggested !== rs.decks ? `Suggested: ${suggested} for ${playerCount} players` : undefined}>
          {num(rs.decks, (n) => set({ decks: n }), 1, 4)}
        </Field>
        <Field label="Jokers per deck">{num(rs.jokersPerDeck, (n) => set({ jokersPerDeck: n }), 0, 4)}</Field>
        <Field label="Cards per round">{num(rs.cardsPerRound, (n) => set({ cardsPerRound: n }), 5, 20)}</Field>
        <Field label="Buys per round">{num(rs.buysPerRound, (n) => set({ buysPerRound: n }), 0, 10)}</Field>
        <Field label="Penalty cards per buy">{num(rs.buyPenaltyCards, (n) => set({ buyPenaltyCards: n }), 0, 3)}</Field>
        <Field label="Buy window (seconds)">{num(rs.buyWindowSeconds, (n) => set({ buyWindowSeconds: n }), 3, 60)}</Field>
        <Field label="Turn timer (seconds, 0 = off)">{num(rs.turnTimerSeconds, (n) => set({ turnTimerSeconds: n }), 0, 600)}</Field>
      </div>

      <Field label="Wild cards">
        <select
          className={input}
          value={wildMode}
          onChange={(e) => {
            const v = e.target.value;
            set({ wilds: { jokers: true, ranks: v === 'jokers' ? [] : v === '2' ? ['2'] : v === '10' ? ['10'] : rs.wilds.ranks.length ? rs.wilds.ranks : ['J'] } });
          }}
        >
          <option value="jokers">Jokers only</option>
          <option value="2">Jokers + 2s</option>
          <option value="10">Jokers + 10s</option>
          <option value="custom">Jokers + custom rank(s)</option>
        </select>
      </Field>
      {wildMode === 'custom' && (
        <div className="flex flex-wrap gap-1">
          {RANKS.map((r) => (
            <button
              key={r}
              className={`rounded px-2 py-1 text-sm ${rs.wilds.ranks.includes(r) ? 'bg-amber-400 text-black' : 'bg-white/15'}`}
              onClick={() => {
                const ranks: Rank[] = rs.wilds.ranks.includes(r) ? rs.wilds.ranks.filter((x) => x !== r) : [...rs.wilds.ranks, r];
                set({ wilds: { jokers: true, ranks } });
              }}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Aces">
          <select className={input} value={rs.acesHighLow} onChange={(e) => set({ acesHighLow: e.target.value as RuleSet['acesHighLow'] })}>
            <option value="either">High or low (no wrap)</option>
            <option value="low">Low only</option>
            <option value="high">High only</option>
          </select>
        </Field>
        <Field label="Laying off">
          <select className={input} value={rs.layOff} onChange={(e) => set({ layOff: e.target.value as RuleSet['layOff'] })}>
            <option value="afterOwnContract">After laying down</option>
            <option value="never">Never</option>
          </select>
        </Field>
        <Field label="Wild replacement">
          <select
            className={input}
            value={!rs.wildReplacement.enabled ? 'off' : rs.wildReplacement.who}
            onChange={(e) => {
              const v = e.target.value;
              set({ wildReplacement: { ...rs.wildReplacement, enabled: v !== 'off', who: v === 'off' ? rs.wildReplacement.who : (v as 'ownerOrLaidDown' | 'ownerOnly') } });
            }}
          >
            <option value="ownerOrLaidDown">Owner or anyone laid down</option>
            <option value="ownerOnly">Owner only</option>
            <option value="off">Off</option>
          </select>
        </Field>
        <Field label="Freed wild">
          <select
            className={input}
            value={rs.wildReplacement.mustPlayImmediately ? 'now' : 'hold'}
            onChange={(e) => set({ wildReplacement: { ...rs.wildReplacement, mustPlayImmediately: e.target.value === 'now' } })}
          >
            <option value="now">Must be played immediately</option>
            <option value="hold">May be kept in hand</option>
          </select>
        </Field>
      </div>

      <details className="rounded-lg bg-white/5 p-3">
        <summary className="cursor-pointer text-sm font-semibold">Scoring</summary>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Field label="Face cards (J Q K)">{num(rs.scoring.faceCards, (n) => set({ scoring: { ...rs.scoring, faceCards: n } }), 0)}</Field>
          <Field label="Aces">{num(rs.scoring.ace, (n) => set({ scoring: { ...rs.scoring, ace: n } }), 0)}</Field>
          <Field label="Jokers">{num(rs.scoring.joker, (n) => set({ scoring: { ...rs.scoring, joker: n } }), 0)}</Field>
          <Field label="Wild-rank cards">{num(rs.scoring.wildRank, (n) => set({ scoring: { ...rs.scoring, wildRank: n } }), 0)}</Field>
        </div>
        <p className="mt-2 text-xs text-white/50">Number cards always score face value.</p>
      </details>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Rounds ({rs.rounds.length})</h3>
          <Button size="sm" variant="secondary" onClick={addRound}>
            + Add round
          </Button>
        </div>
        <ol className="flex flex-col gap-2">
          {rs.rounds.map((r, i) => (
            <li key={r.id} className="rounded-lg bg-black/25 p-2">
              <div className="flex items-center gap-2">
                <span className="w-6 text-sm text-white/60">{i + 1}.</span>
                <span className="flex-1 text-sm font-medium">{r.name}</span>
                <button className="px-1 text-white/60" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                  ↑
                </button>
                <button className="px-1 text-white/60" onClick={() => move(i, 1)} disabled={i === rs.rounds.length - 1} aria-label="Move down">
                  ↓
                </button>
                <button className="px-1 text-red-300" onClick={() => set({ rounds: rs.rounds.filter((_, j) => j !== i) })} aria-label="Remove round">
                  ✕
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {r.melds.map((m, mi) => (
                  <span key={mi} className="inline-flex items-center gap-1 rounded bg-white/10 px-1.5 py-1 text-xs">
                    <select className="rounded bg-white px-1 py-0.5 text-black" value={m.kind} onChange={(e) => updateMeld(i, mi, { kind: e.target.value as 'set' | 'run', size: e.target.value === 'set' ? Math.max(3, m.size) : Math.max(4, m.size) })}>
                      <option value="set">set</option>
                      <option value="run">run</option>
                    </select>
                    of
                    <input type="number" className="w-12 rounded bg-white px-1 py-0.5 text-black" value={m.size} min={m.kind === 'set' ? 3 : 4} max={13} onChange={(e) => updateMeld(i, mi, { size: Number(e.target.value) })} />
                    <button className="text-white/60" onClick={() => { const melds = r.melds.filter((_, j) => j !== mi); updateRound(i, { melds, name: contractName(melds) }); }} aria-label="Remove meld">
                      ✕
                    </button>
                  </span>
                ))}
                <button className="rounded bg-white/10 px-2 py-1 text-xs" onClick={() => { const melds: MeldRequirement[] = [...r.melds, { kind: 'set', size: 3 }]; updateRound(i, { melds, name: contractName(melds) }); }}>
                  + meld
                </button>
                <label className="ml-auto flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={r.noDiscard} onChange={(e) => updateRound(i, { noDiscard: e.target.checked })} /> no discard
                </label>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {problems.length > 0 && (
        <ul className="rounded-lg bg-red-500/20 p-3 text-sm text-red-100">
          {problems.map((p) => (
            <li key={p}>• {p}</li>
          ))}
        </ul>
      )}

      {onSave && (
        <section className="flex gap-2">
          <input className={`${input} min-w-0 flex-1`} placeholder="Save as… (name)" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
          <Button
            variant="secondary"
            disabled={!saveName.trim() || saving || problems.length > 0}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(saveName.trim());
                setSaveName('');
              } finally {
                setSaving(false);
              }
            }}
          >
            Save
          </Button>
        </section>
      )}
    </div>
  );
}
