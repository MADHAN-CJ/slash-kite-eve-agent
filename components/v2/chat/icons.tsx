/**
 * The chat shell's icons — the same 24×24 stroke paths the prototype inlines
 * (markets-hero ux/shared/chat/app.js `I`, markup.js). `svg.i` is styled in chat.css.
 */

const PATHS = {
  search: ['M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0', 'M21 21l-6 -6'],
  rail: ['M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z', 'M9 4l0 16'],
  plus: ['M12 5l0 14', 'M5 12l14 0'],
  bell: ['M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6', 'M9 17v1a3 3 0 0 0 6 0v-1'],
  signin: ['M15 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2', 'M21 12h-13l3 -3', 'M11 15l-3 -3'],
  sun: [
    'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0',
    'M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7',
  ],
  menu: ['M4 6l16 0', 'M4 12l16 0', 'M4 18l16 0'],
  back: ['M5 12l14 0', 'M5 12l6 6', 'M5 12l6 -6'],
  data: ['M12 6m-8 0a8 3 0 1 0 16 0a8 3 0 1 0 -16 0', 'M4 6v6a8 3 0 0 0 16 0v-6', 'M4 12v6a8 3 0 0 0 16 0v-6'],
  share: ['M13 4v4c-6.575 1.028 -9.02 6.788 -10 12c-.037 .206 5.384 -5.962 10 -6v4l8 -7l-8 -7z'],
  down: ['M6 9l6 6l6 -6'],
  up: ['M12 5l0 14', 'M18 11l-6 -6', 'M6 11l6 -6'],
  mic: ['M9 2m0 3a3 3 0 0 1 3 -3h0a3 3 0 0 1 3 3v5a3 3 0 0 1 -3 3h0a3 3 0 0 1 -3 -3z', 'M5 10a7 7 0 0 0 14 0', 'M8 21l8 0', 'M12 17l0 4'],
  trash: [
    'M4 7l16 0',
    'M10 11l0 6',
    'M14 11l0 6',
    'M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12',
    'M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3',
  ],
  chat: ['M8 9h8', 'M8 13h6', 'M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z'],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { readonly name: IconName; readonly className?: string }) {
  return (
    <svg className={className ? `i ${className}` : 'i'} viewBox="0 0 24 24">
      {PATHS[name].map((d) => (
        <path d={d} key={d} />
      ))}
    </svg>
  );
}

/** The stop square is filled, not stroked. */
export function StopIcon() {
  return (
    <svg className="i" viewBox="0 0 24 24">
      <path d="M17 4h-10a3 3 0 0 0 -3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3 -3v-10a3 3 0 0 0 -3 -3z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** The arrow on the gate banner's button carries its own stroke settings in the prototype. */
export function ArrowRight() {
  return (
    <svg
      className="i"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      style={{ fill: 'none', stroke: 'currentColor' }}
      viewBox="0 0 24 24"
    >
      <path d="M5 12h14" />
      <path d="M13 6l6 6l-6 6" />
    </svg>
  );
}
