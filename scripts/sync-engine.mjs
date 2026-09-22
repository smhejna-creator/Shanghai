// Copies src/engine (minus tests) into supabase/functions/_shared/engine so the
// Edge Function bundles the exact same reducer the client uses.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const src = new URL('../src/engine', import.meta.url).pathname;
const dest = new URL('../supabase/functions/_shared/engine', import.meta.url).pathname;
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const f of readdirSync(src)) {
  if (f === '__tests__') continue;
  cpSync(join(src, f), join(dest, f));
}
console.log('engine synced to', dest);
