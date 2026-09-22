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
  const dragging = useRef(false);

  useEffect(() => {
    const ids = new Set(cards.map((c) => c.id));
    setOrder((prev) => {
      const kept = prev.filter((id) => ids.has(id));
      const added = cards.map((c) => c.id).filter((id) => !kept.includes(id));
      const next = [...kept, ...added];
      return next.length === prev.length && next.every((id, i) => id === prev[i]) ? prev : next;
    });
  }, [cards]);

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
    if (!s.dragging) {
      if (Math.abs(e.clientX - s.x) > 8 || Math.abs(e.clientY - s.y) > 8) {
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

  const n = ordered.length;
  return (
    <div
      ref={scroller}
      className="no-scrollbar flex touch-pan-x items-end overflow-x-auto px-5 pb-4 pt-6"
      style={{ touchAction: drag ? 'none' : 'pan-x' }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {ordered.map((c, i) => {
        const tilt = n > 1 ? ((i - (n - 1) / 2) / (n - 1)) * 10 : 0;
        return (
          <div
            key={c.id}
            data-card
            onPointerDown={onPointerDown(c.id)}
            className={`-ml-6 first:ml-0 transition-all ${drag?.id === c.id ? 'z-20 scale-110 opacity-80' : ''} ${drag && drag.over === i && drag.id !== c.id ? 'ml-1' : ''}`}
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
