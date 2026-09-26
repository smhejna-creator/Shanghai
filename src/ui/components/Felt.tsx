import { useEffect, useState, type ReactNode } from 'react';

/** The oval table surface. Children are positioned absolutely by the caller. */
export function Felt({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`felt relative w-full rounded-[48%/40%] ${className}`}>
      <div className="pointer-events-none absolute inset-[14px] rounded-[48%/40%] border border-white/10" />
      {children}
    </div>
  );
}

/**
 * Seat position for opponent i of n (0-based), as CSS percentages.
 * 'arc'  = across the top only (short mobile tables).
 * 'ring' = all the way around, leaving the bottom for the local player (desktop).
 */
export function seatPosition(i: number, n: number, layout: 'arc' | 'ring'): { left: string; top: string } {
  let deg: number;
  if (layout === 'arc') deg = -180 + (180 * (i + 1)) / (n + 1);
  else deg = 90 + (360 * (i + 1)) / (n + 1);
  const rad = (deg * Math.PI) / 180;
  const rx = layout === 'arc' ? 40 : 44;
  const ry = layout === 'arc' ? 40 : 40;
  return { left: `${50 + rx * Math.cos(rad)}%`, top: `${50 + ry * Math.sin(rad)}%` };
}

/** @deprecated use seatPosition */
export const arcPosition = (i: number, n: number) => seatPosition(i, n, 'arc');

/** Tailwind `lg` breakpoint, mirrored in JS for seat layout. */
export function useIsDesktop(): boolean {
  const query = '(min-width: 1024px)';
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return match;
}
