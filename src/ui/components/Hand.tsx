import { useEffect, useRef, useState } from 'react';
import type { Card, RuleSet } from '@/engine/index.ts';
import { isWild, rankValue, type Rank } from '@/engine/index.ts';
import { CardView } from './CardView';

interface Props {
  /** Cards in display order (controlled by the parent). */
  cards: Card[];
  ruleSet: RuleSet;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onReorder: (ids: string[]) => void;
}

/** Two neighbours "belong together" when they could share a set or a run. Used for visual gaps. */
export function related(a: Card, b: Card, rs: RuleSet): boolean {
  if (isWild(a, rs) || isWild(b, rs)) return true;
  if (a.rank === b.rank) return true;
  if (a.suit === b.suit) {
    const d = Math.abs(rankValue(a.rank as Rank) - rankValue(b.rank as Rank));
    return d <= 2 || d === 12; // A next to K counts too
  }
  return false;
}

/** Horizontal, scrollable fan. Tap selects; press-and-hold then drag reorders. */
export function Hand({ cards, ruleSet, selected, onToggle, onReorder }: Props) {
  const [drag, setDrag] = useState<{ id: string; over: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const start = useRef<{ id: string; x: number; y: number; moved: boolean; timer?: number; dragging: boolean } | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const block = (e: TouchEvent) => {
      if (dragging.current) e.preventDefault();
    };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, []);

  const ids = cards.map((c) => c.id);
  const indexAt = (clientX: number) => {
    const el = scroller.current;
    if (!el) return 0;
    const items = Array.from(el.querySelectorAll<HTMLElement>('[data-card]'));
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (clientX < r.left + r.width / 2) return i;
    }
    return items.length - 1;
  };

  const onPointerDown = (id: string) => (e: React.PointerEvent) => {
    start.current = { id, x: e.clientX, y: e.clientY, moved: false, dragging: false };
    const timer = window.setTimeout(() => {
      if (start.current && !start.current.moved) {
        start.current.dragging = true;
        dragging.current = true;
        setDrag({ id, over: ids.indexOf(id) });
        if (navigator.vibrate) navigator.vibrate(10);
      }
    }, 220);
    start.current.timer = timer;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    if (!s.dragging) {
      if (Math.abs(e.clientX - s.x) > 8 || Math.abs(e.clientY - s.y) > 8) {
        s.moved = true;
        window.clearTimeout(s.timer);
      }
      return;
    }
    e.preventDefault();
    setDrag({ id: s.id, over: indexAt(e.clientX) });
  };
  const finish = (clientX?: number) => {
    const s = start.current;
    if (!s) return;
    window.clearTimeout(s.timer);
    if (s.dragging && clientX !== undefined) {
      const from = ids.indexOf(s.id);
      const to = indexAt(clientX);
      if (from !== to) {
        const next = ids.slice();
        next.splice(from, 1);
        next.splice(to, 0, s.id);
        onReorder(next);
      }
    } else if (!s.moved && !s.dragging) {
      onToggle(s.id);
    }
    start.current = null;
    dragging.current = false;
    setDrag(null);
  };

  const n = cards.length;
  return (
    <div
      ref={scroller}
      className="no-scrollbar flex touch-pan-x select-none items-end overflow-x-auto px-5 pb-4 pt-6"
      style={{ touchAction: drag ? 'none' : 'pan-x', WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e.clientX)}
      onPointerCancel={() => finish()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {cards.map((c, i) => {
        const tilt = n > 1 ? ((i - (n - 1) / 2) / (n - 1)) * 8 : 0;
        const gap = i > 0 && !related(cards[i - 1], c, ruleSet);
        return (
          <div
            key={c.id}
            data-card
            onPointerDown={onPointerDown(c.id)}
            className={`transition-all ${i === 0 ? '' : gap ? 'ml-2' : '-ml-6'} ${drag?.id === c.id ? 'z-20 scale-110 opacity-80' : ''} ${drag && drag.over === i && drag.id !== c.id ? '!ml-3' : ''}`}
            style={{ zIndex: drag?.id === c.id ? 30 : i, transform: selected.has(c.id) ? undefined : `rotate(${tilt}deg) translateY(${Math.abs(tilt) * 0.3}px)` }}
          >
            <CardView card={c} ruleSet={ruleSet} selected={selected.has(c.id)} />
          </div>
        );
      })}
      {n === 0 && <div className="w-full py-6 text-center text-sm text-white/50">No cards in hand</div>}
    </div>
  );
}
