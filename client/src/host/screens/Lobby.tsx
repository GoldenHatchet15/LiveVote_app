import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import type { PlayerSummary } from '@livevote/shared';
import { NameTag } from '../../components/NameTag';

export function Lobby({
  pin,
  joinUrl,
  qrUrl,
  title,
  players,
  showVoterNames,
  onToggleVoterNames,
}: {
  pin: string;
  joinUrl: string;
  qrUrl: string;
  title: string;
  players: PlayerSummary[];
  showVoterNames: boolean;
  onToggleVoterNames: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <p className="text-2xl font-semibold text-white/70">{title}</p>
        <h1 className="font-display text-3xl font-extrabold text-white/90">
          Join at <span className="text-brand">{joinUrl}</span>
        </h1>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-10">
        <div className="rounded-3xl bg-white p-6 shadow-2xl">
          <QRCodeSVG value={qrUrl} size={260} level="M" />
        </div>
        <div className="text-center">
          <p className="text-3xl font-semibold uppercase tracking-widest text-white/60">
            Game PIN
          </p>
          <p className="font-display text-[10rem] font-black leading-none tracking-tight text-white">
            {pin || '······'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 text-white/80">
        <span
          data-testid="player-count"
          className="flex h-12 items-center rounded-full bg-white/10 px-6 text-3xl font-bold"
        >
          {players.length}
        </span>
        <span className="text-2xl">player{players.length === 1 ? '' : 's'} joined</span>
      </div>

      <button
        data-testid="lobby-voter-names"
        aria-pressed={showVoterNames}
        onClick={onToggleVoterNames}
        className="flex items-center gap-3 rounded-full bg-white/10 px-5 py-2 text-white/80 hover:bg-white/20"
      >
        <span
          className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${
            showVoterNames ? 'bg-brand' : 'bg-white/25'
          }`}
        >
          <span
            className={`h-5 w-5 rounded-full bg-white transition-transform ${
              showVoterNames ? 'translate-x-5' : ''
            }`}
          />
        </span>
        <span className="text-lg font-semibold">
          Show voter names on results: {showVoterNames ? 'On' : 'Off'}
        </span>
      </button>

      <div className="flex max-h-[26vh] max-w-6xl flex-wrap justify-center gap-3 overflow-hidden">
        <AnimatePresence>
          {players.map((p) => (
            <motion.span
              key={p.id}
              layout
              initial={{ scale: 0.4, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 24 }}
            >
              <NameTag nickname={p.nickname} avatarEmoji={p.avatarEmoji} color={p.color} size="lg" />
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
