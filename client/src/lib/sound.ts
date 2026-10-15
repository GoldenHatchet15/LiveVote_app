/**
 * Tiny WebAudio sound engine for the host screen — synthesized tones, so there
 * are no audio asset files to ship. Muted by default; the host toggles it.
 */
let ctx: AudioContext | null = null;
let muted = true;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

function tone(freq: number, durationMs: number, when = 0, gain = 0.06): void {
  const context = ac();
  if (!context || muted) return;
  const osc = context.createOscillator();
  const g = context.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(context.destination);
  const start = context.currentTime + when;
  osc.start(start);
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000);
  osc.stop(start + durationMs / 1000);
}

export const sound = {
  setMuted(value: boolean): void {
    muted = value;
    if (!value) void ac()?.resume();
  },
  isMuted(): boolean {
    return muted;
  },
  tick(): void {
    tone(880, 90, 0, 0.03);
  },
  timesUp(): void {
    tone(300, 350, 0);
  },
  reveal(): void {
    tone(523, 120, 0);
    tone(659, 120, 0.12);
    tone(784, 220, 0.24);
  },
  podium(): void {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 260, i * 0.14, 0.07));
  },
};
