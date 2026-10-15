import { useEffect } from 'react';
import confetti from 'canvas-confetti';

/** Fires a celebratory confetti burst once when mounted. */
export function Confetti() {
  useEffect(() => {
    const colors = ['#e4002b', '#2563eb', '#f2b705', '#15803d', '#ffffff'];
    const end = Date.now() + 2500;
    const frame = () => {
      confetti({ particleCount: 4, angle: 60, spread: 70, origin: { x: 0 }, colors });
      confetti({ particleCount: 4, angle: 120, spread: 70, origin: { x: 1 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 }, colors });
    frame();
  }, []);
  return null;
}
