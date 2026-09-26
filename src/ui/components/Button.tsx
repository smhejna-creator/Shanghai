import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'; size?: 'sm' | 'md' | 'lg' };

const styles = {
  primary:
    'text-ink font-bold bg-[linear-gradient(180deg,#f7d98a_0%,#e5b64a_50%,#c9962f_100%)] shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_6px_16px_rgba(229,182,74,0.35)] hover:brightness-110 disabled:opacity-40 disabled:shadow-none',
  secondary: 'bg-ink-4 text-white border border-line hover:bg-ink-3 hover:border-white/20 disabled:opacity-40',
  outline: 'bg-transparent text-gold border border-gold/50 hover:bg-gold/10 disabled:opacity-40',
  danger: 'bg-[linear-gradient(180deg,#e05252,#b32b2b)] text-white shadow-[0_6px_16px_rgba(199,59,59,0.35)] hover:brightness-110 disabled:opacity-40 disabled:shadow-none',
  ghost: 'bg-transparent text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40',
};
const sizes = { sm: 'h-9 px-3 text-sm', md: 'h-11 px-5 text-[15px]', lg: 'h-13 px-6 text-base py-3.5' };

export function Button({ variant = 'primary', size = 'md', className = '', ...rest }: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl font-semibold tracking-wide transition active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 ${styles[variant]} ${sizes[size]} ${className}`}
      {...rest}
    />
  );
}
