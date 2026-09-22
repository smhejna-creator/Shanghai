import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// The Edge Function bundles a copy of the engine. Keep it in sync via `npm run sync:engine`.
describe('supabase/functions/_shared/engine', () => {
  it('matches src/engine exactly', () => {
    const src = join(__dirname, '..');
    const copy = join(__dirname, '../../../supabase/functions/_shared/engine');
    expect(existsSync(copy), 'run npm run sync:engine').toBe(true);
    const files = readdirSync(src).filter((f) => f.endsWith('.ts'));
    for (const f of files) {
      expect(readFileSync(join(copy, f), 'utf8'), `${f} is out of date; run npm run sync:engine`).toBe(readFileSync(join(src, f), 'utf8'));
    }
    expect(readdirSync(copy).sort()).toEqual(files.sort());
  });
});
