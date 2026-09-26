import { useEffect, useState } from 'react';
import type { SwoopPublicPlayer, SwoopRuleSet } from '@/engine/index.ts';
import { CardView } from './CardView';

interface Props {
  player: SwoopPublicPlayer;
  ruleSet: SwoopRuleSet;
  active: boolean;
  isDealer: boolean;
  isMe: boolean;
  deadline?: number;
  totalSeconds?: number;
  compact?: boolean;
}

const AVATAR_COLORS = ['#2f5fc2', '#7a3fc4', '#c2582f', '#2c9a5b', '#c73b7a', '#3a8fb5'];
const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

export function SwoopSeat({ player, ruleSet, active, isDealer, isMe, deadline, totalSeconds, compact }: Props) {
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
  const initials = player.name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const out = player.finished !== undefined;

  return (
    <div className={`flex flex-col items-center gap-1 ${!player.connected ? 'opacity-50' : ''} ${out ? 'opacity-70' : ''}`}>
      <div className="relative">
        <div className={`rounded-full p-[3px] ${active ? 'animate-pulseGold' : ''}`} style={{ background: active && deadline ? `conic-gradient(#e5b64a ${frac * 360}deg, rgba(255,255,255,0.12) 0)` : active ? '#e5b64a' : 'rgba(255,255,255,0.12)' }}>
          <div className={`flex items-center justify-center rounded-full font-bold text-white ring-2 ring-ink ${compact ? 'h-10 w-10 text-sm' : 'h-12 w-12 text-base lg:h-14 lg:w-14'}`} style={{ background: `linear-gradient(160deg, ${color}, #0b0e13)` }}>
            {player.isBot ? '🤖' : initials || '?'}
          </div>
        </div>
        {isDealer && <div className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-extrabold text-ink shadow">D</div>}
        {active && deadline && secs > 0 && <div className={`absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-1.5 text-[10px] font-bold tabular-nums shadow ${secs <= 10 ? 'bg-red-600 text-white' : 'bg-gold text-ink'}`}>{secs}</div>}
        {out && <div className="absolute -right-2 -top-1 rounded-full bg-gold px-1 text-[9px] font-extrabold uppercase text-ink shadow">{ORDINAL[player.finished!]} out</div>}
      </div>
      <div className={`max-w-[96px] truncate text-center font-semibold ${compact ? 'text-[11px]' : 'text-xs lg:text-sm'} ${isMe ? 'text-gold' : 'text-white'}`}>{player.name}</div>
      {!isMe && (
        <div className="flex items-center gap-1">
          <span className="rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white/90" title="Cards in hand">✋ {player.handCount}</span>
          <span className="rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white/90" title="Face-down cards">🂠 {player.faceDownCount}</span>
        </div>
      )}
      {!isMe && player.faceUp.length > 0 && (
        <div className="flex">
          {player.faceUp.map((c, i) => (
            <div key={c.id} className="-ml-2 first:ml-0" style={{ zIndex: i }}>
              <CardView card={c} ruleSet={ruleSet} size="xs" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
