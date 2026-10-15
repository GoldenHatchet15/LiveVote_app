import { Shape, shapeColor } from './Shape';

/** A colored answer tile for the host screen (not interactive). */
export function OptionTile({
  index,
  text,
  dim,
  highlight,
  showCorrect,
}: {
  index: number;
  text: string;
  dim?: boolean;
  highlight?: boolean;
  showCorrect?: boolean;
}) {
  return (
    <div
      className="relative flex items-center gap-4 rounded-2xl px-5 py-4 text-white shadow-lg transition-all duration-300"
      style={{
        backgroundColor: shapeColor(index),
        opacity: dim ? 0.35 : 1,
        transform: highlight ? 'scale(1.03)' : 'scale(1)',
        outline: highlight ? '4px solid white' : 'none',
      }}
    >
      <Shape index={index} className="h-9 w-9 shrink-0 text-white" />
      <span className="text-xl font-semibold leading-tight xl:text-3xl">{text}</span>
      {showCorrect && (
        <span className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-xl font-black text-shape-green shadow">
          ✓
        </span>
      )}
    </div>
  );
}
