import { OPTION_SHAPES } from '@livevote/shared';

/** The four answer shapes, matching OPTION_SHAPES order (red/blue/yellow/green). */
export function Shape({
  index,
  className,
}: {
  index: number;
  className?: string;
}) {
  const shape = OPTION_SHAPES[index % OPTION_SHAPES.length]!.shape;
  const common = { fill: 'currentColor' };
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      {shape === 'triangle' && <polygon points="50,12 92,86 8,86" {...common} />}
      {shape === 'diamond' && <polygon points="50,8 92,50 50,92 8,50" {...common} />}
      {shape === 'circle' && <circle cx="50" cy="50" r="42" {...common} />}
      {shape === 'square' && <rect x="14" y="14" width="72" height="72" rx="8" {...common} />}
    </svg>
  );
}

export function shapeColor(index: number): string {
  return OPTION_SHAPES[index % OPTION_SHAPES.length]!.color;
}

export function shapeLabel(index: number): string {
  return OPTION_SHAPES[index % OPTION_SHAPES.length]!.label;
}
