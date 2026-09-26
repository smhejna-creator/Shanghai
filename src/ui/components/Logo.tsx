export function Logo({ size = 'md', className = '', title = 'WINNING HAND', subtitle = 'Card Room' }: { size?: 'sm' | 'md' | 'lg'; className?: string; title?: string; subtitle?: string }) {
  const s = { sm: 'text-xl', md: 'text-3xl', lg: 'text-5xl' }[size];
  const sub = { sm: 'text-[8px]', md: 'text-[10px]', lg: 'text-xs' }[size];
  return (
    <div className={`inline-flex flex-col items-center leading-none ${className}`}>
      <span className={`gold-text font-display font-extrabold tracking-[0.08em] ${s}`}>{title}</span>
      <span className={`mt-1 font-semibold uppercase tracking-[0.42em] text-white/50 ${sub}`}>{subtitle}</span>
    </div>
  );
}
