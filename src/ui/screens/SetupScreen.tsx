import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import type { RuleSet } from '@/engine/index.ts';
import { houseDefault, validateRuleSet } from '@/engine/index.ts';
import { api } from '@/lib/supabase/api';
import { Button } from '../components/Button';
import { RuleSetEditor } from '../components/RuleSetEditor';

export function useSavedRuleSets(userId: string) {
  const [saved, setSaved] = useState<Awaited<ReturnType<typeof api.savedRuleSets>>>([]);
  const reload = () => api.savedRuleSets().then(setSaved).catch(() => {});
  useEffect(() => {
    reload();
  }, [userId]);
  return {
    saved,
    save: async (name: string, rs: RuleSet) => {
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

/** /new — choose rules and create a game. */
export function SetupScreen({ user }: { user: User }) {
  const nav = useNavigate();
  const [rs, setRs] = useState<RuleSet>(houseDefault);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { saved, save, remove } = useSavedRuleSets(user.id);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const name = await api.profile(user.id);
      const r = await api.createGame(rs, name);
      nav(`/g/${r.gameId}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-5 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-amber-300">New game</h1>
        <Button variant="ghost" size="sm" onClick={() => nav('/')}>
          Cancel
        </Button>
      </header>
      <RuleSetEditor value={rs} onChange={setRs} saved={saved} onSave={(n) => save(n, rs)} onDeleteSaved={remove} />
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="safe-bottom sticky bottom-0 -mx-5 bg-felt-dark/95 px-5 py-3 backdrop-blur">
        <Button size="lg" onClick={create} disabled={busy || validateRuleSet(rs).length > 0} className="w-full">
          {busy ? 'Creating…' : 'Create game'}
        </Button>
      </div>
    </div>
  );
}

/** /rulesets — manage saved rule sets. */
export function RuleSetsScreen({ user }: { user: User }) {
  const nav = useNavigate();
  const [rs, setRs] = useState<RuleSet>(houseDefault);
  const { saved, save, remove } = useSavedRuleSets(user.id);
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-5 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-amber-300">Saved rule sets</h1>
        <Button variant="ghost" size="sm" onClick={() => nav('/')}>
          Done
        </Button>
      </header>
      <p className="text-sm text-white/60">Pick a saved set to edit it, change anything, then save under the same or a new name.</p>
      <RuleSetEditor value={rs} onChange={setRs} saved={saved} onSave={(n) => save(n, rs)} onDeleteSaved={remove} />
    </div>
  );
}
