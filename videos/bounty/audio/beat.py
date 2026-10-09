# Synthesize a hype trap beat: python3 beat.py <seconds> <out.wav>
import numpy as np, wave, sys
SR = 48000; BPM = 140; secs = float(sys.argv[1]); out = sys.argv[2]
DROP = float(sys.argv[3]); STOP = (float(sys.argv[4]), float(sys.argv[5])); END = float(sys.argv[6])
beat = 60 / BPM; N = int(SR * secs)
mix = np.zeros((N, 2))
rng = np.random.default_rng(7)
def env(n, a, d): t = np.arange(n) / SR; return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)
def add(sig, at, pan=0.0, gain=1.0):
    i = int(at * SR)
    if i >= N: return
    if i < 0: sig = sig[-i:]; i = 0
    if not len(sig): return
    s = sig[:N - i] * gain
    mix[i:i + len(s), 0] += s * (1 - max(pan, 0)); mix[i:i + len(s), 1] += s * (1 + min(pan, 0))
def kick():
    n = int(.45 * SR); t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 28); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.tanh(2.2 * np.sin(ph) * env(n, .001, .22)) * .9
def b808(note_hz, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    f = note_hz * (1 + .6 * np.exp(-t * 40)); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.tanh(1.8 * np.sin(ph)) * env(n, .003, dur * .9) * .55
def clap():
    n = int(.35 * SR); w = rng.standard_normal(n)
    # band-ish: difference of smoothed noise
    k = np.convolve(w, np.ones(6) / 6, 'same') - np.convolve(w, np.ones(40) / 40, 'same')
    e = np.zeros(n)
    for o in (0, .011, .022): e += env(n, .0005, .012) * 0 + np.r_[np.zeros(int(o*SR)), env(n - int(o*SR), .0005, .01)]
    e += np.r_[np.zeros(int(.03*SR)), env(n - int(.03*SR), .001, .12)]
    return k * e * 1.6
def hat(open_=False):
    n = int((.25 if open_ else .05) * SR); w = rng.standard_normal(n)
    hp = w - np.convolve(w, np.ones(4) / 4, 'same')
    return hp * env(n, .0005, .09 if open_ else .012) * .32
def pad_chord(freqs, dur):
    n = int(dur * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0, 0.12):
            ph = (t * f * (1 + det / 100)) % 1; s += (2 * ph - 1)
    # crude low-pass via moving average
    s = np.convolve(s, np.ones(18) / 18, 'same')
    a = np.minimum(1, t / .08) * np.minimum(1, (dur - t) / .1)
    return s * a * .045
def stab(freqs):
    n = int(.22 * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for f in freqs:
        for det in (-0.2, 0.2): s += np.sign(np.sin(2 * np.pi * f * (1 + det / 100) * t))
    s = np.convolve(s, np.ones(10) / 10, 'same')
    return s * env(n, .002, .09) * .07
# C minor-ish progression: Cm - Ab - Bb - G
roots = [65.41, 51.91, 58.27, 49.0]  # C2, Ab1, Bb1, G1
chords = [[261.6, 311.1, 392.0], [207.7, 261.6, 311.1], [233.1, 293.7, 349.2], [196.0, 246.9, 293.7]]
bar = beat * 4
t_first = DROP - bar * int(DROP / bar + 1)   # bar grid aligned so DROP lands on a downbeat
def impact(dur=2.2):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 30 + 90 * np.exp(-t * 9); sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .9)
    w = rng.standard_normal(n); nz = np.convolve(w, np.ones(30) / 30, 'same') * np.exp(-t / .25)
    return np.tanh(1.6 * (sub * .9 + nz * 1.5)) * .9
b = 0
while True:
    t0 = t_first + b * bar; b += 1
    if t0 >= secs: break
    if t0 + bar <= 0: continue
    ch = b % 4; built = t0 >= DROP - 1e-6
    if t0 >= END + 0.05: continue
    add(pad_chord(chords[ch], bar), max(t0, 0), gain=1.0 if built else .8)
    if not built:
        # build: stabs, hats getting denser, kick on downbeat, riser in last bar
        for st in (0, 1.5, 3): add(stab([f * 2 for f in chords[ch]]), t0 + st * beat, pan=.3, gain=.7)
        add(kick(), t0, gain=.7)
        dens = 2 if DROP - t0 > 2 * bar else 4
        for h in range(4 * dens): add(hat(), t0 + h * beat / dens, pan=.2, gain=.35 + .25 * (h / (4 * dens)))
        if DROP - t0 <= bar + 1e-6:
            n = int(bar * SR); tt = np.arange(n) / SR; w = rng.standard_normal(n)
            add(np.convolve(w, np.ones(3)/3, 'same') * (tt / bar) ** 2.5 * .22, t0)
            for r in range(16): add(clap(), t0 + 2 * beat + r * beat / 8, gain=.15 + r * .04)
        continue
    for st in (0, 1.5, 3): add(stab([f * 2 for f in chords[ch]]), t0 + st * beat, pan=.3 if st else -.3)
    for kb in ((0, 2.5) if b % 2 else (0, 0.75, 2.5)):
        add(kick(), t0 + kb * beat); add(b808(roots[ch], beat * (1.4 if kb else 2.3)), t0 + kb * beat)
    add(clap(), t0 + 2 * beat, gain=.9)
    for h in range(8): add(hat(), t0 + h * beat / 2, pan=.2, gain=.9 if h % 2 == 0 else .6)
    if b % 2 == 1:
        for r in range(6): add(hat(), t0 + 3.5 * beat + r * beat / 12, pan=.2, gain=.5 + r * .06)
    add(hat(True), t0 + 3.5 * beat, pan=-.2, gain=.6)
# Stop window (silence the beat for the SOLD! moment), then impacts
a, z = int(STOP[0] * SR), int(STOP[1] * SR)
f = int(.22 * SR); mix[a - f:a] *= np.linspace(1, 0, f)[:, None] ** 2   # smooth fade into the gap
mix[a:z] = 0
r = int(.01 * SR); mix[z:z + r] *= np.linspace(0, 1, r)[:, None]          # no click on re-entry
add(impact(), DROP, gain=1.0); add(impact(1.6), STOP[1], gain=.8); add(impact(3.0), END, gain=1.1)
# End: let pad ring after END
n = int(2.5 * SR); add(pad_chord(chords[0], 2.5) * 1.4, END)
mix = np.tanh(mix * 1.2) * .8
fade = int(.8 * SR); mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
pcm = (mix * 32767).astype('<i2')
with wave.open(out, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('wrote', out, secs, 's, bar =', round(bar, 3), 's')
