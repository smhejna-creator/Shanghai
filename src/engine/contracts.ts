import type { Card } from './cards';
import type { Contract, RuleSet } from './ruleset';
import { buildRun, buildSet, type Meld } from './melds';

export type BuiltMeld = Omit<Meld, 'id' | 'ownerSeat'>;

export type ContractMatch = { ok: true; melds: BuiltMeld[] } | { ok: false; error: string };

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) out.push([item, ...p]);
  });
  return out;
}

/**
 * Match a list of card groups against a contract. Each group must satisfy exactly
 * one requirement; the number of groups must equal the number of requirements.
 * Melds may be larger than the minimum size.
 */
export function matchContract(groups: Card[][], contract: Contract, rs: RuleSet): ContractMatch {
  if (groups.length !== contract.melds.length)
    return { ok: false, error: `This contract needs exactly ${contract.melds.length} melds` };
  const seen = new Set<string>();
  for (const g of groups)
    for (const c of g) {
      if (seen.has(c.id)) return { ok: false, error: 'A card cannot be used in two melds' };
      seen.add(c.id);
    }
  const asSet = groups.map((g) => buildSet(g, rs));
  const asRun = groups.map((g) => buildRun(g, rs));
  let lastError = 'Melds do not satisfy the contract';
  for (const order of permutations(contract.melds.map((_, i) => i))) {
    const melds: BuiltMeld[] = [];
    let good = true;
    for (let gi = 0; gi < groups.length; gi++) {
      const req = contract.melds[order[gi]];
      const built = req.kind === 'set' ? asSet[gi] : asRun[gi];
      if (!built.ok) {
        good = false;
        lastError = built.error;
        break;
      }
      if (built.value.cards.length < req.size) {
        good = false;
        lastError = `A ${req.kind} of at least ${req.size} is required`;
        break;
      }
      melds.push(built.value);
    }
    if (good) return { ok: true, melds };
  }
  return { ok: false, error: lastError };
}
