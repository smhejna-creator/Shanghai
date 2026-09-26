import type { Card, RuleSet, SwoopRuleSet } from '@/engine/index.ts';
import { cardKind, isWild } from '@/engine/index.ts';

export type AnyRuleSet = RuleSet | SwoopRuleSet;

/** Is this card "special" for highlighting, whichever game is running? */
export function isSpecial(card: Card, rs: AnyRuleSet): boolean {
  if ((rs as SwoopRuleSet).game === 'swoop') return cardKind(card, rs as SwoopRuleSet) !== 'normal';
  return isWild(card, rs as RuleSet);
}

/** Shanghai-only wildness; false for Swoop. */
export function isWildAny(card: Card, rs: AnyRuleSet): boolean {
  if ((rs as SwoopRuleSet).game === 'swoop') return false;
  return isWild(card, rs as RuleSet);
}
