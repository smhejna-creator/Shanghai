// UI smoke test: serves a built bundle, fakes Supabase over HTTP, and renders the
// lobby, table, and setup screens on a phone viewport, failing on console errors.
//
//   VITE_SUPABASE_URL=http://fake.supabase.local VITE_SUPABASE_ANON_KEY=anon npx vite build --outDir /tmp/smoke
//   npm i --no-save playwright && node --experimental-strip-types scripts/smoke.mjs /tmp/smoke /tmp/shots
//
// Not part of `npm test` because it needs a Chromium download.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { reduce, createGame, toPublicState, houseDefault, createSwoopGame, reduceSwoop, toSwoopPublicState, swoopDefault, swoopBotAction } from '../src/engine/index.ts';

const dist = process.argv[2];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  let p = join(dist, req.url.split('?')[0]);
  if (!existsSync(p) || p.endsWith('/')) p = join(dist, 'index.html');
  res.setHeader('Content-Type', mime[extname(p)] ?? 'application/octet-stream');
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(4173, r));

// Build a real game state with the engine.
const rs = houseDefault();
const NOW = Date.now();
let s = createGame('u0', 'smoke');
const step = (a) => { const r = reduce(rs, s, a); if (!r.ok) throw new Error(r.error.message); s = r.state; };
step({ type: 'JOIN', userId: 'u0', name: 'Host' });
step({ type: 'JOIN', userId: 'u1', name: 'Bob' });
step({ type: 'JOIN', userId: 'u2', name: 'Cat' });
step({ type: 'READY', userId: 'u1', ready: true });
step({ type: 'READY', userId: 'u2', ready: true });
const lobby = structuredClone(s);
step({ type: 'START', userId: 'u0', now: NOW });
step({ type: 'DRAW_STOCK', userId: 'u1', now: NOW });
step({ type: 'DISCARD', userId: 'u1', cardId: s.players[1].hand[0].id, now: NOW });
step({ type: 'BUY', userId: 'u0', now: NOW }); // seat 0 has priority (after current seat 2)
step({ type: 'DRAW_STOCK', userId: 'u2', now: NOW });
step({ type: 'DISCARD', userId: 'u2', cardId: s.players[2].hand[0].id, now: NOW });
// now seat 0 (Host, our user) is current in buy.window or turn.draw
const playing = s;
const me = 'u0';

const jwtPayload = Buffer.from(JSON.stringify({ sub: me, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', aud: 'authenticated' })).toString('base64url');
const token = `eyJhbGciOiJIUzI1NiJ9.${jwtPayload}.sig`;
const session = { access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: me, email: 'host@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' } };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
// Swoop game: host + 2 bots, past the swap phase, host to play.
const srs = { ...swoopDefault(), decks: 2 };
let sw = createSwoopGame('u0', 'smoke-swoop');
const sstep = (a) => { const r = reduceSwoop(srs, sw, a); if (!r.ok) throw new Error(r.error.message); sw = r.state; };
sstep({ type: 'JOIN', userId: 'u0', name: 'Host' });
sstep({ type: 'ADD_BOT', userId: 'u0', botId: 'b1', name: 'Ada' });
sstep({ type: 'ADD_BOT', userId: 'u0', botId: 'b2', name: 'Turing' });
sstep({ type: 'START', userId: 'u0', now: NOW });
for (let i = 0; i < 20; i++) { const a = swoopBotAction(srs, sw, NOW); if (!a) break; sstep(a); }
const swoopSwap = structuredClone(sw);
sstep({ type: 'DONE_SWAPPING', userId: 'u0', now: NOW });
for (let i = 0; i < 40 && sw.phase === 'turn' && sw.players[sw.currentSeat].isBot; i++) sstep(swoopBotAction(srs, sw, NOW));
const swoopPlaying = sw;

async function run(state, label, checks, desktop = false, gameType = 'shanghai') {
  const ctx = await browser.newContext(desktop ? { viewport: { width: 1440, height: 900 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('WebSocket')) errors.push(`[${label}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror ${e.message}`));
  await page.route('http://fake.supabase.local/**', async (route) => {
    const url = route.request().url();
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (url.includes('/rest/v1/games')) return json(gameType === 'swoop'
      ? { join_code: 'SW00P1', status: 'playing', game_type: 'swoop', ruleset: srs, public_state: toSwoopPublicState(state), version: state.version }
      : { join_code: 'ABC123', status: state.phase === 'lobby' ? 'lobby' : 'playing', game_type: 'shanghai', ruleset: rs, public_state: toPublicState(state), version: state.version });
    if (url.includes('/rest/v1/game_hands')) return json({ seat: 0, cards: state.players[0].hand });
    if (url.includes('/rest/v1/profiles')) return json({ display_name: 'Host' });
    if (url.includes('/rest/v1/saved_rulesets')) return json([]);
    if (url.includes('/rpc/my_games')) return json([]);
    if (url.includes('/auth/v1/user')) return json(session.user);
    if (url.includes('/functions/v1/game-action')) { errors.push(`[${label}] action sent: ${route.request().postData()}`); return json({ ok: true, version: state.version + 1 }); }
    return json([]);
  });
  await page.addInitScript((sess) => { localStorage.setItem('sb-fake-auth-token', JSON.stringify(sess)); }, session);
  await page.goto('http://localhost:4173/g/11111111-1111-1111-1111-111111111111');
  await page.waitForTimeout(1500);
  const text = await page.innerText('body');
  for (const c of checks) if (!text.toLowerCase().includes(c.toLowerCase())) errors.push(`[${label}] missing text: ${c}`);
  await page.screenshot({ path: `${process.argv[3]}/${label}.png` });
  await page.screenshot({ path: `${process.argv[3]}/${label}-full.png`, fullPage: true });
  return { page, ctx, text };
}
const l = await run(lobby, 'lobby', ['Lobby', 'ABC123', 'Bob', 'Cat', 'Start game']);
await l.ctx.close();
const t = await run(playing, 'table', ['Round 1/7', 'two sets of 3', 'Your turn', 'Stock', 'Discard']);
// Interact: tap the first hand card, expect "clear 1"
await t.page.locator('[data-card]').first().tap();
await t.page.waitForTimeout(300);
if (!(await t.page.innerText('body')).includes('clear 1')) errors.push('[table] tap-select did not select a card');
await t.page.screenshot({ path: `${process.argv[3]}/table-selected.png` });
// Arrange controls: nudge the selected card right, then auto-group, then sort by suit.
const firstId = await t.page.locator('[data-card]').first().evaluate((el) => el.querySelector('button')?.textContent);
await t.page.getByRole('button', { name: 'Move selected right' }).tap();
await t.page.waitForTimeout(200);
const secondId = await t.page.locator('[data-card]').nth(1).evaluate((el) => el.querySelector('button')?.textContent);
if (firstId !== secondId) errors.push('[table] nudge right did not move the selected card');
await t.page.getByRole('button', { name: '✨ Group' }).tap();
await t.page.waitForTimeout(200);
await t.page.getByRole('button', { name: '♠ Suit' }).tap();
await t.page.waitForTimeout(300);
await t.page.screenshot({ path: `${process.argv[3]}/table-sorted.png` });
await t.ctx.close();
// Swoop views
for (const [st, label, desktop] of [[swoopSwap, 'swoop-swap', false], [swoopPlaying, 'swoop-table', false], [swoopPlaying, 'swoop-table-desktop', true]]) {
  const d = await run(st, label, ['Swoop', 'Pile', 'Stock'], desktop, 'swoop');
  await d.ctx.close();
}
// Desktop views
for (const [st, label] of [[lobby, 'lobby-desktop'], [playing, 'table-desktop']]) {
  const d = await run(st, label, [], true);
  await d.ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[home-desktop] pageerror ${e.message}`));
  await page.route('http://fake.supabase.local/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.addInitScript((sess) => { localStorage.setItem('sb-fake-auth-token', JSON.stringify(sess)); }, session);
  await page.goto('http://localhost:4173/');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${process.argv[3]}/home-desktop.png` });
  await ctx.close();
}
// Home screen
const h = await (async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[home] pageerror ${e.message}`));
  await page.route('http://fake.supabase.local/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.addInitScript((sess) => { localStorage.setItem('sb-fake-auth-token', JSON.stringify(sess)); }, session);
  await page.goto('http://localhost:4173/new');
  await page.waitForTimeout(1000);
  const text = await page.innerText('body');
  for (const c of ['New table', 'House default', 'Classic 2s wild', 'Rounds (7)', 'three runs of 4']) if (!text.toLowerCase().includes(c.toLowerCase())) errors.push(`[setup] missing ${c}`);
  await page.screenshot({ path: `${process.argv[3]}/setup.png`, fullPage: true });
  await ctx.close();
})();
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[auth] pageerror ${e.message}`));
  await page.route('http://fake.supabase.local/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('http://localhost:4173/');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${process.argv[3]}/auth.png` });
  await ctx.close();
}
await browser.close();
server.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'SMOKE OK');
process.exit(errors.length ? 1 : 0);
