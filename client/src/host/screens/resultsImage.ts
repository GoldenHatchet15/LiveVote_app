import type { QuestionSummary } from '@livevote/shared';

/**
 * Render the end-of-session results summary to a PNG and trigger a download.
 *
 * Drawn straight onto a canvas (not captured from the DOM) so it needs no
 * extra dependency and is unaffected by the app's strict CSP.
 */
export function downloadResultsImage(summary: QuestionSummary[]): void {
  const W = 1200;
  const PAD = 48;
  const ink = '#11131a';
  const brand = '#e4002b';

  // Measure first with a throwaway context so we can size the canvas to fit.
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return;

  interface Line {
    text: string;
    font: string;
    color: string;
    gap: number; // vertical space after the line
  }
  const lines: Line[] = [];
  const wrap = (text: string, font: string, color: string, gap: number, maxWidth: number) => {
    probe.font = font;
    const words = text.split(/\s+/);
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (probe.measureText(next).width > maxWidth && line) {
        lines.push({ text: line, font, color, gap: 6 });
        line = word;
      } else {
        line = next;
      }
    }
    lines.push({ text: line || ' ', font, color, gap });
  };

  const inner = W - PAD * 2;
  wrap('🏆 Results', '800 56px "Baloo 2", system-ui, sans-serif', ink, 32, inner);
  summary.forEach((card, i) => {
    wrap(`${i + 1}. ${card.text}`, '700 30px Inter, system-ui, sans-serif', ink, 10, inner);
    if (card.winners.length === 0) {
      wrap('No votes.', '400 26px Inter, system-ui, sans-serif', '#9aa0ad', 28, inner);
      return;
    }
    if (card.tie) wrap('TIE', '700 20px Inter, system-ui, sans-serif', brand, 6, inner);
    card.winners.forEach((w) => {
      wrap(`👑 ${w.label}  —  ${w.count} votes · ${w.percent}%`, '600 28px Inter, system-ui, sans-serif', brand, 6, inner);
      if (w.voters && w.voters.length) {
        const names = w.voters.map((v) => v.nickname).join(', ');
        wrap(names, '400 22px Inter, system-ui, sans-serif', '#5a616e', 6, inner);
      }
    });
    lines[lines.length - 1]!.gap = 28;
  });

  // Compute height from line metrics.
  let H = PAD * 2;
  for (const l of lines) {
    const size = parseInt(l.font.match(/(\d+)px/)?.[1] ?? '26', 10);
    H += size + l.gap;
  }

  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'top';

  let y = PAD;
  for (const l of lines) {
    const size = parseInt(l.font.match(/(\d+)px/)?.[1] ?? '26', 10);
    ctx.font = l.font;
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, PAD, y);
    y += size + l.gap;
  }

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'livevote-results.png';
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
