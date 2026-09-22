// Helpers that search a hand for playable melds. Used by tests (bots) and by the
// UI's "auto-arrange" button. Pure functions, no side effects.
import { isWild, rankValue, type Card } from './cards';
import { layOffCards, runBounds, type Meld } from './melds';
import { matchContract } from './contracts';
import type { Contract, MeldRequirement, Rank, RuleSet } from './ruleset';

function combinations<T>(items: T[], k: number, cap = 40): T[][] {
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (out.length >= cap) return;
    if (acc.length === k) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i < items.length; i++) rec(i + 1, [...acc, items[i]]);
  };
  rec(0, []);
  return out;
}

function candidateSets(cards: Card[], size: number, rs: RuleSet): Card[][] {
  const wilds = cards.filter((c) => isWild(c, rs));
  const byRank = new Map<Rank, Card[]>();
  for (const c of cards) {
    if (isWild(c, rs)) continue;
    const list = byRank.get(c.rank as Rank) ?? [];
    list.push(c);
    byRank.set(c.rank as Rank, list);
  }
  const out: Card[][] = [];
  for (const naturals of byRank.values()) {
    const minNaturals = Math.ceil(size / 2);
    for (let n = Math.min(size, naturals.length); n >= minNaturals; n--) {
      const w = size - n;
      if (w > wilds.length) continue;
      for (const nat of combinations(naturals, n, 10)) out.push([...nat, ...wilds.slice(0, w)]);
    }
  }
  return out;
}

function candidateRuns(cards: Card[], size: number, rs: RuleSet): Card[][] {
  const wilds = cards.filter((c) => isWild(c, rs));
  const { lo, hi } = runBounds(rs);
  const out: Card[][] = [];
  for (const suit of ['S', 'H', 'D', 'C'] as const) {
    const naturals = cards.filter((c) => !isWild(c, rs) && c.suit === suit);
    if (naturals.length === 0) continue;
    for (let low = lo; low + size - 1 <= hi; low++) {
      const used = new Set<string>();
      const group: Card[] = [];
      let wildCount = 0;
      let prevWild = false;
      let good = true;
      for (let v = low; v < low + size; v++) {
        const natural = naturals.find((c) => !used.has(c.id) && rankMatches(c.rank as Rank, v));
        if (natural) {
          used.add(natural.id);
          group.push(natural);
          prevWild = false;
        } else {
          if (prevWild || wildCount >= wilds.length) {
            good = false;
            break;
          }
          group.push(wilds[wildCount++]);
          prevWild = true;
        }
      }
      if (good && wildCount <= size - wildCount) out.push(group);
    }
  }
  return out;
}

function rankMatches(rank: Rank, value: number): boolean {
  if (rank === 'A') return value === 1 || value === 14;
  return rankValue(rank) === value;
}

/** Find card groups in `hand` that satisfy `contract`, or null. Uses minimum meld sizes. */
export function findContractMelds(hand: Card[], contract: Contract, rs: RuleSet): Card[][] | null {
  const reqs: MeldRequirement[] = contract.melds;
  const search = (i: number, remaining: Card[], acc: Card[][]): Card[][] | null => {
    if (i === reqs.length) return acc;
    const req = reqs[i];
    const candidates = req.kind === 'set' ? candidateSets(remaining, req.size, rs) : candidateRuns(remaining, req.size, rs);
    for (const group of candidates) {
      const usedIds = new Set(group.map((c) => c.id));
      const rest = remaining.filter((c) => !usedIds.has(c.id));
      const found = search(i + 1, rest, [...acc, group]);
      if (found) return found;
    }
    return null;
  };
  const result = search(0, hand, []);
  if (!result) return null;
  return matchContract(result, contract, rs).ok ? result : null;
}

/** Greedy lay-offs: every card in `hand` that fits on some meld. Keeps `keep` cards in hand. */
export function findLayOffs(hand: Card[], melds: Meld[], rs: RuleSet, keep: number): { meldId: string; cardIds: string[] }[] {
  const out: { meldId: string; cardIds: string[] }[] = [];
  let remaining = hand.slice();
  const current = melds.map((m) => structuredClone(m));
  let progress = true;
  while (progress && remaining.length > keep) {
    progress = false;
    // Naturals first so wilds don't block them.
    const ordered = remaining.slice().sort((a, b) => Number(isWild(a, rs)) - Number(isWild(b, rs)));
    for (const card of ordered) {
      if (remaining.length <= keep) break;
      for (let mi = 0; mi < current.length; mi++) {
        const r = layOffCards(current[mi], [card], rs);
        if (r.ok) {
          current[mi] = r.value;
          out.push({ meldId: current[mi].id, cardIds: [card.id] });
          remaining = remaining.filter((c) => c.id !== card.id);
          progress = true;
          break;
        }
      }
    }
  }
  return out;
}
