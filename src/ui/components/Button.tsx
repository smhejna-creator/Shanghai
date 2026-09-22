import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'sm' | 'md' | 'lg' };

const styles = {
  primary: 'bg-amber-400 text-black hover:bg-amber-300 disabled:bg-amber-400/40',
  secondary: 'bg-white/15 text-white hover:bg-white/25 disabled:bg-white/5 disabled:text-white/40',
  danger: 'bg-red-600 text-white hover:bg-red-500 disabled:bg-red-600/40',
  ghost: 'bg-transparent text-white/80 hover:bg-white/10 disabled:text-white/30',
};
const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-base', lg: 'px-5 py-3 text-lg' };

export function Button({ variant = 'primary', size = 'md', className = '', ...rest }: Props) {
  return (
    <button
      className={`rounded-xl font-semibold shadow-sm transition active:scale-95 disabled:cursor-not-allowed disabled:active:scale-100 ${styles[variant]} ${sizes[size]} ${className}`}
      {...rest}
    />
  );
}
