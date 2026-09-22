// RuleSet: every configurable rule of Shang Hi. No React / Supabase imports.

export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export type MeldRequirement = { kind: 'set'; size: number } | { kind: 'run'; size: number };

export interface Contract {
  id: string;
  name: string;
  melds: MeldRequirement[];
  noDiscard: boolean;
}

export type AceMode = 'high' | 'low' | 'either';

export interface RuleSet {
  version: 1;
  name: string;
  players: { min: number; max: number };
  decks: number;
  jokersPerDeck: number;
  wilds: { jokers: true; ranks: Rank[] };
  rounds: Contract[];
  cardsPerRound: number;
  buysPerRound: number;
  buyPenaltyCards: number;
  buyWindowSeconds: number;
  acesHighLow: AceMode;
  layOff: 'afterOwnContract' | 'never';
  wildReplacement: {
    enabled: boolean;
    who: 'ownerOrLaidDown' | 'ownerOnly';
    mustPlayImmediately: boolean;
  };
  scoring: {
    numberCards: 'faceValue';
    faceCards: number;
    ace: number;
    joker: number;
    wildRank: number;
  };
  turnTimerSeconds: number;
  winner: 'lowestTotal';
}

export const MIN_SET = 3;
export const MIN_RUN = 4;

export function contractName(melds: MeldRequirement[]): string {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];
  const counts = new Map<string, number>();
  for (const m of melds) {
    const key = `${m.kind}:${m.size}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const [key, n] of counts) {
    const [kind, size] = key.split(':');
    parts.push(`${words[n] ?? n} ${kind}${n === 1 ? '' : 's'} of ${size}`);
  }
  return parts.join(', ');
}

function contract(id: string, melds: MeldRequirement[], noDiscard = false): Contract {
  return { id, name: contractName(melds), melds, noDiscard };
}

export function defaultRounds(): Contract[] {
  const set = (size = 3): MeldRequirement => ({ kind: 'set', size });
  const run = (size = 4): MeldRequirement => ({ kind: 'run', size });
  return [
    contract('r1', [set(), set()]),
    contract('r2', [set(), run()]),
    contract('r3', [run(), run()]),
    contract('r4', [set(), set(), set()]),
    contract('r5', [set(), set(), run()]),
    contract('r6', [set(), run(), run()]),
    contract('r7', [run(), run(), run()], true),
  ];
}

export function houseDefault(): RuleSet {
  return {
    version: 1,
    name: 'House default',
    players: { min: 2, max: 6 },
    decks: 2,
    jokersPerDeck: 2,
    wilds: { jokers: true, ranks: ['10'] },
    rounds: defaultRounds(),
    cardsPerRound: 11,
    buysPerRound: 3,
    buyPenaltyCards: 1,
    buyWindowSeconds: 8,
    acesHighLow: 'either',
    layOff: 'afterOwnContract',
    wildReplacement: { enabled: true, who: 'ownerOrLaidDown', mustPlayImmediately: true },
    scoring: { numberCards: 'faceValue', faceCards: 10, ace: 15, joker: 50, wildRank: 20 },
    turnTimerSeconds: 90,
    winner: 'lowestTotal',
  };
}

export function classic2sWild(): RuleSet {
  return {
    ...houseDefault(),
    name: 'Classic 2s wild',
    wilds: { jokers: true, ranks: ['2'] },
    acesHighLow: 'low',
    buysPerRound: 2,
  };
}

export const PRESETS: { key: string; label: string; build: () => RuleSet }[] = [
  { key: 'house', label: 'House default', build: houseDefault },
  { key: 'classic2', label: 'Classic 2s wild', build: classic2sWild },
];

/** Suggested deck count for a player count (3 decks at 5+). */
export function suggestedDecks(players: number): number {
  return players >= 5 ? 3 : 2;
}

export function validateRuleSet(rs: RuleSet): string[] {
  const errors: string[] = [];
  if (rs.version !== 1) errors.push('Unsupported ruleset version');
  if (!rs.name || !rs.name.trim()) errors.push('Ruleset needs a name');
  if (rs.players.min < 2 || rs.players.max > 6 || rs.players.min > rs.players.max)
    errors.push('Players must be between 2 and 6');
  if (!Number.isInteger(rs.decks) || rs.decks < 1 || rs.decks > 4) errors.push('Decks must be 1–4');
  if (!Number.isInteger(rs.jokersPerDeck) || rs.jokersPerDeck < 0 || rs.jokersPerDeck > 4)
    errors.push('Jokers per deck must be 0–4');
  if (rs.rounds.length < 1) errors.push('At least one round is required');
  const ids = new Set<string>();
  rs.rounds.forEach((r, i) => {
    if (ids.has(r.id)) errors.push(`Round ${i + 1}: duplicate id`);
    ids.add(r.id);
    if (r.melds.length < 1) errors.push(`Round ${i + 1}: contract needs at least one meld`);
    for (const m of r.melds) {
      if (m.kind === 'set' && (m.size < MIN_SET || !Number.isInteger(m.size)))
        errors.push(`Round ${i + 1}: sets must be at least ${MIN_SET}`);
      if (m.kind === 'run' && (m.size < MIN_RUN || !Number.isInteger(m.size) || m.size > 13))
        errors.push(`Round ${i + 1}: runs must be 4–13`);
    }
    const needed = r.melds.reduce((a, m) => a + m.size, 0);
    if (needed > rs.cardsPerRound + rs.buysPerRound * (1 + rs.buyPenaltyCards) + 1)
      errors.push(`Round ${i + 1}: contract needs more cards than a player can hold`);
  });
  if (!Number.isInteger(rs.cardsPerRound) || rs.cardsPerRound < 5 || rs.cardsPerRound > 20)
    errors.push('Cards per round must be 5–20');
  if (!Number.isInteger(rs.buysPerRound) || rs.buysPerRound < 0 || rs.buysPerRound > 10)
    errors.push('Buys per round must be 0–10');
  if (!Number.isInteger(rs.buyPenaltyCards) || rs.buyPenaltyCards < 0 || rs.buyPenaltyCards > 3)
    errors.push('Buy penalty cards must be 0–3');
  if (rs.buyWindowSeconds < 3 || rs.buyWindowSeconds > 60) errors.push('Buy window must be 3–60 seconds');
  if (rs.turnTimerSeconds !== 0 && (rs.turnTimerSeconds < 10 || rs.turnTimerSeconds > 600))
    errors.push('Turn timer must be 0 (off) or 10–600 seconds');
  for (const r of rs.wilds.ranks) if (!RANKS.includes(r)) errors.push(`Unknown wild rank ${r}`);
  if (rs.wilds.ranks.length >= 12) errors.push('Too many wild ranks');
  // Cards available: are there enough cards for everyone?
  const totalCards = rs.decks * (52 + rs.jokersPerDeck);
  if (rs.players.max * rs.cardsPerRound + 1 > totalCards)
    errors.push('Not enough cards in the chosen decks for the maximum player count');
  for (const s of [rs.scoring.faceCards, rs.scoring.ace, rs.scoring.joker, rs.scoring.wildRank])
    if (!Number.isFinite(s) || s < 0) errors.push('Scores must be non-negative numbers');
  return errors;
}
