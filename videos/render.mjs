// Renders a scene.html (which exposes window.render(t)) to frames, then to MP4 with ffmpeg.
// Usage: node videos/render.mjs <sceneDir> [seconds] [fps]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2]);
const seconds = Number(process.argv[3] ?? 10);
const fps = Number(process.argv[4] ?? 30);
const frames = path.join(dir, 'frames');
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto('file://' + path.join(dir, 'scene.html'));
const total = Math.round(seconds * fps);
for (let i = 0; i < total; i++) {
  await page.evaluate((t) => window.render(t), i / fps);
  await page.screenshot({ path: path.join(frames, `f${String(i).padStart(5, '0')}.png`) });
}
await browser.close();

const out = path.join(dir, path.basename(dir) + '.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps),
  '-i', path.join(frames, 'f%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', out]);
rmSync(frames, { recursive: true, force: true });
console.log('wrote', out);
