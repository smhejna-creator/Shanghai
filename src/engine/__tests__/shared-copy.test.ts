import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    if (f === '__tests__') continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...files(p, base));
    else if (f.endsWith('.ts')) out.push(p.slice(base.length + 1));
  }
  return out.sort();
}

// The Edge Function bundles a copy of the engine. Keep it in sync via `npm run sync:engine`.
describe('supabase/functions/_shared/engine', () => {
  it('matches src/engine exactly', () => {
    const src = join(__dirname, '..');
    const copy = join(__dirname, '../../../supabase/functions/_shared/engine');
    expect(existsSync(copy), 'run npm run sync:engine').toBe(true);
    const list = files(src);
    for (const f of list) {
      expect(readFileSync(join(copy, f), 'utf8'), `${f} is out of date; run npm run sync:engine`).toBe(readFileSync(join(src, f), 'utf8'));
    }
    expect(files(copy)).toEqual(list);
  });
});
