import { useEffect, useState } from 'react';

export function Countdown({ deadline, className = '' }: { deadline?: number; className?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  if (!deadline) return null;
  const s = Math.max(0, Math.ceil((deadline - now) / 1000));
  return <span className={`tabular-nums ${s <= 10 ? 'text-red-400' : 'text-gold'} ${className}`}>{s}s</span>;
}
