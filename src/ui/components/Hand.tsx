import { useEffect, useRef, useState } from 'react';
import type { Card, RuleSet } from '@/engine/index.ts';
import { CardView } from './CardView';

interface Props {
  cards: Card[];
  ruleSet: RuleSet;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onReorder: (ids: string[]) => void;
}

/** Horizontal, scrollable fan. Tap selects; press-and-drag reorders. */
export function Hand({ cards, ruleSet, selected, onToggle, onReorder }: Props) {
  const [order, setOrder] = useState<string[]>(() => cards.map((c) => c.id));
  const [drag, setDrag] = useState<{ id: string; x: number; over: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const start = useRef<{ id: string; x: number; y: number; moved: boolean; timer?: number; dragging: boolean } | null>(null);

  // Merge server hand into local order (keeps the player's arrangement, appends new cards).
  useEffect(() => {
    const ids = new Set(cards.map((c) => c.id));
    setOrder((prev) => {
      const kept = prev.filter((id) => ids.has(id));
      const added = cards.map((c) => c.id).filter((id) => !kept.includes(id));
      const next = [...kept, ...added];
      return next.length === prev.length && next.every((id, i) => id === prev[i]) ? prev : next;
    });
  }, [cards]);

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

  const byId = new Map(cards.map((c) => [c.id, c]));
  const ordered = order.map((id) => byId.get(id)).filter((c): c is Card => Boolean(c));

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
        setDrag({ id, x: e.clientX, over: order.indexOf(id) });
        if (navigator.vibrate) navigator.vibrate(10);
      }
    }, 180);
    start.current.timer = timer;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.dragging) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        s.moved = true;
        window.clearTimeout(s.timer);
      }
      return;
    }
    e.preventDefault();
    setDrag({ id: s.id, x: e.clientX, over: indexAt(e.clientX) });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    window.clearTimeout(s.timer);
    if (s.dragging) {
      const from = order.indexOf(s.id);
      const to = indexAt(e.clientX);
      if (from !== to) {
        const next = order.slice();
        next.splice(from, 1);
        next.splice(to, 0, s.id);
        setOrder(next);
        onReorder(next);
      }
    } else if (!s.moved) {
      onToggle(s.id);
    }
    start.current = null;
    dragging.current = false;
    setDrag(null);
  };
  const onPointerCancel = () => {
    if (start.current) window.clearTimeout(start.current.timer);
    start.current = null;
    dragging.current = false;
    setDrag(null);
  };

  return (
    <div
      ref={scroller}
      className="no-scrollbar flex touch-pan-x items-end gap-0 overflow-x-auto px-4 pb-2 pt-5"
      style={{ touchAction: drag ? 'none' : 'pan-x' }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {ordered.map((c, i) => (
        <div
          key={c.id}
          data-card
          onPointerDown={onPointerDown(c.id)}
          className={`-ml-5 first:ml-0 transition-all ${drag?.id === c.id ? 'z-20 scale-110 opacity-70' : ''} ${
            drag && drag.over === i && drag.id !== c.id ? 'ml-2' : ''
          }`}
          style={{ zIndex: drag?.id === c.id ? 30 : i }}
        >
          <CardView card={c} ruleSet={ruleSet} selected={selected.has(c.id)} />
        </div>
      ))}
      {ordered.length === 0 && <div className="py-6 text-sm text-white/60">No cards in hand</div>}
    </div>
  );
}
