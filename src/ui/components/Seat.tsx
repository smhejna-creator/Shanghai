import { useEffect, useState } from 'react';
import type { PublicPlayer } from '@/engine/index.ts';

interface Props {
  player: PublicPlayer;
  active: boolean;
  isDealer: boolean;
  isMe: boolean;
  deadline?: number;
  totalSeconds?: number;
  compact?: boolean;
  wentOut?: boolean;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const AVATAR_COLORS = ['#2f5fc2', '#7a3fc4', '#c2582f', '#2c9a5b', '#c73b7a', '#3a8fb5'];

export function Seat({ player, active, isDealer, isMe, deadline, totalSeconds, compact, wentOut }: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active || !deadline) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active, deadline]);
  const remaining = deadline ? Math.max(0, deadline - now) : 0;
  const frac = deadline && totalSeconds ? Math.min(1, remaining / (totalSeconds * 1000)) : 1;
  const secs = Math.ceil(remaining / 1000);
  const color = AVATAR_COLORS[player.seat % AVATAR_COLORS.length];
  const avatar = compact ? 'h-10 w-10 text-sm lg:h-14 lg:w-14 lg:text-lg' : 'h-12 w-12 text-base lg:h-16 lg:w-16 lg:text-xl';

  return (
    <div className={`flex flex-col items-center gap-1 ${!player.connected ? 'opacity-50' : ''}`}>
      <div className="relative">
        <div
          className={`rounded-full p-[3px] ${active ? 'animate-pulseGold' : ''}`}
          style={{
            background: active && deadline ? `conic-gradient(#e5b64a ${frac * 360}deg, rgba(255,255,255,0.12) 0)` : active ? '#e5b64a' : 'rgba(255,255,255,0.12)',
          }}
        >
          <div
            className={`flex items-center justify-center rounded-full font-bold text-white ring-2 ring-ink ${avatar}`}
            style={{ background: `linear-gradient(160deg, ${color}, #0b0e13)` }}
          >
            {player.isBot ? '🤖' : initials(player.name) || '?'}
          </div>
        </div>
        {isDealer && (
          <div className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-extrabold text-ink shadow" title="Dealer">
            D
          </div>
        )}
        {active && deadline && secs > 0 && (
          <div className={`absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-1.5 text-[10px] font-bold tabular-nums shadow ${secs <= 10 ? 'bg-red-600 text-white' : 'bg-gold text-ink'}`}>{secs}</div>
        )}
        {player.hasLaidDown && !wentOut && (
          <div className="absolute -right-1 -top-1 rounded-full bg-emerald-500 px-1 text-[9px] font-extrabold uppercase text-white shadow">down</div>
        )}
        {wentOut && <div className="absolute -right-2 -top-1 rounded-full bg-gold px-1 text-[9px] font-extrabold uppercase text-ink shadow">out</div>}
      </div>
      <div className={`max-w-[84px] truncate text-center font-semibold lg:max-w-[120px] lg:text-sm ${compact ? 'text-[11px]' : 'text-xs'} ${isMe ? 'text-gold' : 'text-white'}`}>{player.name}</div>
      <div className="flex items-center gap-1">
        <span className="rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white/90">🂠 {player.handCount}</span>
        <span className="flex items-center gap-0.5" title={`${player.buysLeft} buys left`}>
          {Array.from({ length: player.buysLeft }, (_, i) => (
            <span key={i} className="chip !h-3 !min-w-3 !px-0 text-chip-red" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.85), inset 0 0 0 2px #c73b3b, 0 1px 2px rgba(0,0,0,0.5)', background: '#c73b3b' }} />
          ))}
        </span>
      </div>
    </div>
  );
}
