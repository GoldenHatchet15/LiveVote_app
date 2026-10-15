import { OptionTile } from './OptionTile';

export interface StageOption {
  index: number;
  text: string;
}

/**
 * The QUESTION-phase layout: question text, optional image, and colored option
 * tiles. Shared by the host screen and the admin preview so "preview matches
 * the host" is true by construction.
 */
export function QuestionStage({
  text,
  imageUrl,
  options,
  markCorrect,
  dimUnmarked,
}: {
  text: string;
  imageUrl?: string | null;
  options: StageOption[];
  /** Option indices to flag as correct (preview + reveal). */
  markCorrect?: number[];
  dimUnmarked?: boolean;
}) {
  const correct = new Set(markCorrect ?? []);
  const cols = options.length <= 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2';
  return (
    <div className="flex w-full flex-col gap-6">
      <h2 className="text-center text-3xl font-bold leading-tight xl:text-5xl">
        {text || 'Untitled question'}
      </h2>
      {imageUrl ? (
        <div className="flex justify-center">
          <img
            src={imageUrl}
            alt=""
            className="max-h-[32vh] rounded-2xl object-contain shadow-lg"
          />
        </div>
      ) : null}
      <div className={`grid gap-4 ${cols}`}>
        {options.map((o) => (
          <OptionTile
            key={o.index}
            index={o.index}
            text={o.text || `Option ${o.index + 1}`}
            showCorrect={correct.has(o.index)}
            dim={dimUnmarked && markCorrect ? !correct.has(o.index) : false}
          />
        ))}
      </div>
    </div>
  );
}
