import type { ReactNode } from 'react';

/** The oval table surface. Children are positioned absolutely by the caller. */
export function Felt({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`felt relative w-full rounded-[48%/40%] ${className}`}>
      <div className="pointer-events-none absolute inset-[14px] rounded-[48%/40%] border border-white/10" />
      {children}
    </div>
  );
}

/** Position on the top arc of the felt for opponent i of n (0-based). Returns CSS left/top percentages. */
export function arcPosition(i: number, n: number): { left: string; top: string } {
  const deg = -180 + (180 * (i + 1)) / (n + 1);
  const rad = (deg * Math.PI) / 180;
  const x = 50 + 40 * Math.cos(rad);
  const y = 50 + 40 * Math.sin(rad);
  return { left: `${x}%`, top: `${y}%` };
}
