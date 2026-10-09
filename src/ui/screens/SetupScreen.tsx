import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import type { GameType, RuleSet, SwoopRuleSet } from '@/engine/index.ts';
import { GAMES, gameModule, houseDefault, swoopDefault, validateRuleSet, validateSwoopRuleSet } from '@/engine/index.ts';
import { api } from '@/lib/supabase/api';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { RuleSetEditor } from '../components/RuleSetEditor';
import { SwoopRuleSetEditor } from '../components/SwoopRuleSetEditor';

type AnyRuleSet = RuleSet | SwoopRuleSet;
export const ruleSetGame = (rs: AnyRuleSet): GameType => ((rs as SwoopRuleSet).game === 'swoop' ? 'swoop' : 'shanghai');

export function useSavedRuleSets(userId: string, gameType: GameType) {
  const [all, setAll] = useState<Awaited<ReturnType<typeof api.savedRuleSets>>>([]);
  const reload = () => api.savedRuleSets().then(setAll).catch(() => {});
  useEffect(() => {
    reload();
  }, [userId]);
  const saved = all.filter((s) => ruleSetGame(s.ruleset) === gameType);
  return {
    saved,
    save: async (name: string, rs: AnyRuleSet) => {
      const existing = saved.find((s) => s.name === name);
      await api.saveRuleSet(userId, name, rs, existing?.id);
      await reload();
    },
    remove: async (id: string) => {
      await api.deleteRuleSet(id);
      await reload();
    },
  };
}

/** Editor for either game's rules. */
export function RulesEditor({ gameType, value, onChange, userId, playerCount }: { gameType: GameType; value: AnyRuleSet; onChange: (rs: AnyRuleSet) => void; userId: string; playerCount?: number }) {
  const { saved, save, remove } = useSavedRuleSets(userId, gameType);
  if (gameType === 'swoop')
    return <SwoopRuleSetEditor value={value as SwoopRuleSet} onChange={onChange} saved={saved as { id: string; name: string; ruleset: SwoopRuleSet }[]} onSave={(n) => save(n, value)} onDeleteSaved={remove} playerCount={playerCount} />;
  return <RuleSetEditor value={value as RuleSet} onChange={onChange} saved={saved as { id: string; name: string; ruleset: RuleSet }[]} onSave={(n) => save(n, value)} onDeleteSaved={remove} playerCount={playerCount} />;
}

export function validateAny(gameType: GameType, rs: AnyRuleSet): string[] {
  return gameType === 'swoop' ? validateSwoopRuleSet(rs as SwoopRuleSet) : validateRuleSet(rs as RuleSet);
}

/** /new/:game — choose rules and create a table. */
export function SetupScreen({ user }: { user: User }) {
  const nav = useNavigate();
  const { game } = useParams();
  const gameType: GameType = game === 'swoop' ? 'swoop' : 'shanghai';
  const mod = GAMES[gameType];
  const [rs, setRs] = useState<AnyRuleSet>(() => (gameType === 'swoop' ? swoopDefault() : houseDefault()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const name = await api.profile(user.id);
      const r = await api.createGame(gameType, rs, name);
      nav(`/g/${r.gameId}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="safe-top mx-auto flex max-w-md flex-col gap-4 px-5 py-6 lg:max-w-3xl lg:py-10">
      <header className="flex items-center justify-between">
        <div>
          <div className="label">New table</div>
          <h1 className="font-display text-2xl font-bold gold-text">{mod.title}</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={() => nav('/')}>Cancel</Button>
      </header>
      <p className="text-sm text-white/60">{mod.tagline}</p>
      <div className="panel p-4">
        <RulesEditor gameType={gameType} value={rs} onChange={setRs} userId={user.id} />
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="safe-bottom sticky bottom-0 -mx-5 bg-ink/95 px-5 py-3 backdrop-blur">
        <Button size="lg" onClick={create} disabled={busy || validateAny(gameType, rs).length > 0} className="w-full">
          {busy ? 'Opening…' : `Open ${mod.title} table`}
        </Button>
      </div>
    </div>
  );
}

/** /rulesets — manage saved rule sets for both games. */
export function RuleSetsScreen({ user }: { user: User }) {
  const nav = useNavigate();
  const [gameType, setGameType] = useState<GameType>('shanghai');
  const [rs, setRs] = useState<AnyRuleSet>(houseDefault);
  const switchGame = (g: GameType) => {
    setGameType(g);
    setRs(gameModule(g).defaultRuleSet());
  };
  return (
    <div className="safe-top mx-auto flex max-w-md flex-col gap-4 px-5 py-6 lg:max-w-3xl lg:py-10">
      <header className="flex items-center justify-between">
        <Logo size="sm" className="!items-start" />
        <Button variant="ghost" size="sm" onClick={() => nav('/')}>Done</Button>
      </header>
      <h1 className="font-display text-2xl font-bold">Saved rule sets</h1>
      <div className="grid grid-cols-2 rounded-xl bg-ink-3 p-1 text-sm font-semibold">
        {(['shanghai', 'swoop'] as GameType[]).map((g) => (
          <button key={g} className={`rounded-lg py-2 transition ${gameType === g ? 'bg-ink-4 text-gold shadow' : 'text-white/60'}`} onClick={() => switchGame(g)}>{GAMES[g].title}</button>
        ))}
      </div>
      <p className="text-sm text-white/60">Pick a saved set to edit it, change anything, then save under the same or a new name.</p>
      <div className="panel p-4">
        <RulesEditor key={gameType} gameType={gameType} value={rs} onChange={setRs} userId={user.id} />
      </div>
    </div>
  );
}
