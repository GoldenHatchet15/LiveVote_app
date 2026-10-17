import { useState } from 'react';

/** Bundled Twemoji (CC-BY 4.0) SVG for consistent rendering across devices (same
 *  asset on the projector and every phone); falls back to the native glyph if
 *  the asset can't be loaded. Assets live in client/public/twemoji/. */
function codepoints(emoji: string): string {
  return Array.from(emoji)
    .map((c) => c.codePointAt(0)!.toString(16))
    .filter((cp) => cp !== 'fe0f') // drop variation selectors
    .join('-');
}

export function Emoji({ emoji, className }: { emoji: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !emoji) {
    return (
      <span className={className} role="img" aria-label="avatar">
        {emoji}
      </span>
    );
  }
  const url = `/twemoji/${codepoints(emoji)}.svg`;
  return (
    <img
      src={url}
      alt={emoji}
      className={className}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      style={{ display: 'inline-block', objectFit: 'contain' }}
    />
  );
}
