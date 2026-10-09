// Copies src/engine (minus tests) into supabase/functions/_shared/engine so the
// Edge Function bundles the exact same reducers the client uses.
import { cpSync, rmSync } from 'node:fs';

const src = new URL('../src/engine', import.meta.url).pathname;
const dest = new URL('../supabase/functions/_shared/engine', import.meta.url).pathname;
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true, filter: (p) => !p.includes('__tests__') });
console.log('engine synced to', dest);
