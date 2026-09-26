import { useMemo, useState } from 'react';
import type { Rank, SwoopRuleSet } from '@/engine/index.ts';
import { RANKS, SWOOP_PRESETS, cardsPerPlayer, suggestedSwoopDecks, validateSwoopRuleSet } from '@/engine/index.ts';
import { Button } from './Button';

interface Props {
  value: SwoopRuleSet;
  onChange: (rs: SwoopRuleSet) => void;
  saved?: { id: string; name: string; ruleset: SwoopRuleSet }[];
  onSave?: (name: string) => Promise<void>;
  onDeleteSaved?: (id: string) => Promise<void>;
  playerCount?: number;
}

const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="flex flex-col gap-1">
    <span className="label">{label}</span>
    {children}
    {hint && <span className="text-xs text-white/50">{hint}</span>}
  </label>
);
const input = 'input !py-2';
const num = (v: number, set: (n: number) => void, min?: number, max?: number) => (
  <input type="number" inputMode="numeric" className={input} value={v} min={min} max={max} onChange={(e) => set(Number(e.target.value))} />
);
const RankPicker = ({ value, onChange }: { value: Rank[]; onChange: (r: Rank[]) => void }) => (
  <div className="flex flex-wrap gap-1">
    {RANKS.map((r) => (
      <button key={r} type="button" className={`rounded px-2 py-1 text-sm ${value.includes(r) ? 'bg-gold text-ink' : 'bg-ink-4'}`} onClick={() => onChange(value.includes(r) ? value.filter((x) => x !== r) : [...value, r])}>
        {r}
      </button>
    ))}
  </div>
);

export function SwoopRuleSetEditor({ value: rs, onChange, saved = [], onSave, onDeleteSaved, playerCount }: Props) {
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const problems = useMemo(() => validateSwoopRuleSet(rs), [rs]);
  const set = (patch: Partial<SwoopRuleSet>) => onChange({ ...rs, ...patch });
  const suggested = suggestedSwoopDecks(rs, playerCount ?? rs.players.min);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-wrap gap-2">
        {SWOOP_PRESETS.map((p) => (
          <Button key={p.key} variant={rs.name === p.label ? 'primary' : 'secondary'} size="sm" onClick={() => onChange(p.build())}>{p.label}</Button>
        ))}
        {saved.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1">
            <Button variant={rs.name === s.name ? 'primary' : 'secondary'} size="sm" onClick={() => onChange({ ...s.ruleset, name: s.name })}>{s.name}</Button>
            {onDeleteSaved && <button className="text-xs text-white/50 hover:text-red-300" title="Delete" onClick={() => onDeleteSaved(s.id)}>✕</button>}
          </span>
        ))}
      </section>

      <Field label="Rule set name"><input className={input} value={rs.name} onChange={(e) => set({ name: e.target.value })} /></Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Face-down cards">{num(rs.faceDown, (n) => set({ faceDown: n }), 0, 8)}</Field>
        <Field label="Face-up cards">{num(rs.faceUp, (n) => set({ faceUp: n }), 0, 8)}</Field>
        <Field label="Cards in hand">{num(rs.handSize, (n) => set({ handSize: n, refillTo: n }), 0, 8)}</Field>
        <Field label="Draw back up to" hint="After playing from your hand, while the stock lasts">{num(rs.refillTo, (n) => set({ refillTo: n }), 0, 12)}</Field>
        <Field label="Min players">{num(rs.players.min, (n) => set({ players: { ...rs.players, min: n } }), 2, 6)}</Field>
        <Field label="Max players">{num(rs.players.max, (n) => set({ players: { ...rs.players, max: n } }), 2, 6)}</Field>
        <Field label="Decks" hint={`${cardsPerPlayer(rs)} cards per player · suggested ${suggested} deck${suggested === 1 ? '' : 's'} for ${playerCount ?? rs.players.min} players`}>{num(rs.decks, (n) => set({ decks: n }), 1, 4)}</Field>
        <Field label="Jokers per deck">{num(rs.jokersPerDeck, (n) => set({ jokersPerDeck: n }), 0, 4)}</Field>
        <Field label="Rounds (hands)">{num(rs.rounds, (n) => set({ rounds: n }), 1, 20)}</Field>
        <Field label="Turn timer (seconds, 0 = off)">{num(rs.turnTimerSeconds, (n) => set({ turnTimerSeconds: n }), 0, 600)}</Field>
      </div>

      <Field label="Swoop cards (play on anything, clear the pile)"><RankPicker value={rs.clearRanks} onChange={(clearRanks) => set({ clearRanks })} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rs.jokersClear} onChange={(e) => set({ jokersClear: e.target.checked })} /> Jokers swoop too (otherwise they reset)</label>
      <Field label="Reset cards (play on anything, anything follows)"><RankPicker value={rs.resetRanks} onChange={(resetRanks) => set({ resetRanks })} /></Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="After a swoop">
          <select className={input} value={rs.afterClear} onChange={(e) => set({ afterClear: e.target.value as SwoopRuleSet['afterClear'] })}>
            <option value="playAgain">Same player goes again</option>
            <option value="nextPlayer">Next player</option>
          </select>
        </Field>
        <Field label="Aces">
          <select className={input} value={rs.acesHigh ? 'high' : 'low'} onChange={(e) => set({ acesHigh: e.target.value === 'high' })}>
            <option value="high">High</option>
            <option value="low">Low</option>
          </select>
        </Field>
      </div>
      <div className="grid gap-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={rs.fourOfAKindClears} onChange={(e) => set({ fourOfAKindClears: e.target.checked })} /> Four of a kind on the pile clears it</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={rs.sevenLower} onChange={(e) => set({ sevenLower: e.target.checked })} /> After a 7, the next card must be 7 or lower</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={rs.swapPhase} onChange={(e) => set({ swapPhase: e.target.checked })} /> Swap hand cards with face-up cards before play</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={rs.voluntaryPickup} onChange={(e) => set({ voluntaryPickup: e.target.checked })} /> May pick up the pile even with a legal play</label>
      </div>

      {problems.length > 0 && (
        <ul className="rounded-lg bg-red-500/20 p-3 text-sm text-red-100">{problems.map((p) => <li key={p}>• {p}</li>)}</ul>
      )}
      {onSave && (
        <section className="flex gap-2">
          <input className={`${input} min-w-0 flex-1`} placeholder="Save as… (name)" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
          <Button variant="secondary" disabled={!saveName.trim() || saving || problems.length > 0} onClick={async () => { setSaving(true); try { await onSave(saveName.trim()); setSaveName(''); } finally { setSaving(false); } }}>Save</Button>
        </section>
      )}
    </div>
  );
}
