import { textOn } from '@livevote/shared';
import { Emoji } from './Emoji';

/** A player name pill: emoji avatar + nickname on the player's colour, with a
 *  border so it never reads as an answer-option tile. Text colour is chosen for
 *  contrast automatically. */
export function NameTag({
  nickname,
  avatarEmoji,
  color,
  size = 'md',
}: {
  nickname: string;
  avatarEmoji: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const pad = size === 'lg' ? 'px-3 py-1.5 text-lg' : size === 'sm' ? 'px-2 py-0.5 text-sm' : 'px-2.5 py-1';
  const emojiSize = size === 'lg' ? 'h-6 w-6' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  return (
    <span
      data-testid="name-tag"
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${pad}`}
      style={{ backgroundColor: color, color: textOn(color), borderColor: 'rgba(255,255,255,0.35)' }}
    >
      <Emoji emoji={avatarEmoji} className={`${emojiSize} shrink-0`} />
      <span className="max-w-[12rem] truncate">{nickname}</span>
    </span>
  );
}
