// src/components/ui/Icon.jsx
// PlayRoom's own icons: thick round strokes, the weight of the theme's ink
// outlines, in the colour of the text around them (currentColor). Emoji drew
// a different picture on every phone and fought the theme; these look the
// same everywhere and follow dark mode.
//   <Icon name="mic" />  <Icon name="cam" size={28} />  <Icon name="play" />
// Game icons, avatars and the fun bits (👋 🎉) stay emoji on purpose.
import React from "react";

const S = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" };
const F = { fill: "currentColor", stroke: "none" };

// Each: the shapes inside a 24×24 box.
const PATHS = {
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" {...S} /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" {...S} /></>,
  micOff: <><path d="M15 9.5V6a3 3 0 0 0-5.6-1.5M9 9v2a3 3 0 0 0 4.9 2.3M18.5 11a6.5 6.5 0 0 1-1.2 3.8M5.5 11a6.5 6.5 0 0 0 10 5.5M12 17.5V21M8.5 21h7M3.5 3.5l17 17" {...S} /></>,
  cam: <><rect x="2.5" y="6.5" width="13" height="11" rx="2.5" {...S} /><path d="M15.5 10.5l5.5-3v9l-5.5-3z" {...S} /></>,
  camOff: <><path d="M15.5 13.5V9a2.5 2.5 0 0 0-2.5-2.5H8.5M5 6.6A2.5 2.5 0 0 0 2.5 9v6A2.5 2.5 0 0 0 5 17.5h8a2.5 2.5 0 0 0 1.7-.7M15.5 10.5l5.5-3v9l-3.2-1.7M3 3l18 18" {...S} /></>,
  flip: <path d="M4.5 11a7.5 7.5 0 0 1 13.2-4.3L19.5 9M19.5 4v5h-5M19.5 13a7.5 7.5 0 0 1-13.2 4.3L4.5 15M4.5 20v-5h5" {...S} />,
  screen: <><rect x="2.5" y="4" width="19" height="12.5" rx="2.5" {...S} /><path d="M8.5 20.5h7M12 16.5v4" {...S} /></>,
  chat: <path d="M5 4.5h14A2.5 2.5 0 0 1 21.5 7v7.5A2.5 2.5 0 0 1 19 17h-6.5l-5 4v-4H5a2.5 2.5 0 0 1-2.5-2.5V7A2.5 2.5 0 0 1 5 4.5z" {...S} />,
  phone: <path {...F} d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />,
  hangup: <path {...F} d="M12 8.5c-3.4 0-6.6.9-9.2 2.6a1.6 1.6 0 0 0-.6 1.9l.9 2.3a1.4 1.4 0 0 0 1.8.8l3.1-1.2a1.4 1.4 0 0 0 .9-1.3v-1.9a13.7 13.7 0 0 1 6.2 0v1.9a1.4 1.4 0 0 0 .9 1.3l3.1 1.2a1.4 1.4 0 0 0 1.8-.8l.9-2.3a1.6 1.6 0 0 0-.6-1.9A16.8 16.8 0 0 0 12 8.5z" />,
  film: <><rect x="3" y="4.5" width="18" height="15" rx="2.5" {...S} /><path d="M7.5 4.5v15M16.5 4.5v15M3 9.5h4.5M3 14.5h4.5M16.5 9.5H21M16.5 14.5H21" {...S} /></>,
  youtube: <><rect x="2.5" y="5.5" width="19" height="13" rx="4" {...S} /><path {...F} d="M10 9.2v5.6l4.8-2.8z" /></>,
  people: <><circle cx="9" cy="8" r="3.4" {...S} /><path d="M2.8 19.5c.6-3.4 3.2-5.2 6.2-5.2s5.6 1.8 6.2 5.2M16 4.8a3.2 3.2 0 0 1 0 6.3M18.3 14.3c1.6.8 2.6 2.4 2.9 5.2" {...S} /></>,
  plus: <path d="M12 5v14M5 12h14" {...S} />,
  down: <path d="M6 9l6 6 6-6" {...S} />,
  back: <path d="M19 12H5.5M11 6l-6 6 6 6" {...S} />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" {...S} />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" {...S} />,
  play: <path {...F} d="M8 4.8v14.4a1 1 0 0 0 1.5.9l11.2-7.2a1 1 0 0 0 0-1.8L9.5 3.9A1 1 0 0 0 8 4.8z" />,
  sound: <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" {...S} /><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" {...S} /></>,
  gamepad: <><path d="M7.5 7.5h9a4.6 4.6 0 0 1 4.5 5.6l-.8 3.6a2.4 2.4 0 0 1-4 1.2L14 15.8h-4l-2.2 2.1a2.4 2.4 0 0 1-4-1.2l-.8-3.6a4.6 4.6 0 0 1 4.5-5.6z" {...S} /><path d="M8 10.5v3.5M6.25 12.25h3.5" {...S} /><circle cx="15.5" cy="11" r="1.15" {...F} /><circle cx="17.5" cy="13.4" r="1.15" {...F} /></>,
  door: <><path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21M3.5 21h17" {...S} /><circle cx="14.5" cy="12.5" r="1.2" {...F} /></>,
  trophy: <path d="M8 3.5h8V9a4 4 0 0 1-8 0zM8 5.5H4.5a3.5 3.5 0 0 0 3.6 4.4M16 5.5h3.5a3.5 3.5 0 0 1-3.6 4.4M12 13v3.5M8 20.5h8M9.5 16.5h5l.5 4h-6z" {...S} />,
  link: <path d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1.1 1.1M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1.1-1.1" {...S} />,
  copy: <><rect x="8.5" y="8.5" width="12" height="12" rx="2.5" {...S} /><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" {...S} /></>,
  share: <path d="M12 14.5V3.5M7.5 8L12 3.5 16.5 8M5 11.5v7A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5v-7" {...S} />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" {...S} /><path d="M15.5 15.5l5 5" {...S} /></>,
  mail: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" {...S} /><path d="M3.5 7l8.5 6.5L20.5 7" {...S} /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" {...S} /><circle cx="12" cy="12" r="3" {...S} /></>,
  grid: <path d="M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z" {...S} />,
  bolt: <path d="M13.5 2.5L4.5 13.5h6.5l-1 8 9-11h-6.5z" {...S} />,
  puzzle: <path d="M4 7.5h4a2.5 2.5 0 1 1 5 0h4v4a2.5 2.5 0 1 1 0 5v4H4v-4.5a2.5 2.5 0 1 0 0-5z" {...S} />,
  flag: <path d="M5.5 21V3.5M5.5 4h12l-2.5 4.5 2.5 4.5h-12" {...S} />,
  mountain: <path d="M2.5 19.5l7-11 4.5 7 2.5-3.5 5 7.5zM7.5 11.7l2 1.3 1.6-1.6" {...S} />,
  team: <><circle cx="7.5" cy="8.5" r="2.8" {...S} /><circle cx="16.5" cy="8.5" r="2.8" {...S} /><path d="M2.5 19c.4-3 2.4-4.6 5-4.6s4.6 1.6 5 4.6M11.5 19c.4-3 2.4-4.6 5-4.6s4.6 1.6 5 4.6" {...S} /></>,
  clock: <><circle cx="12" cy="12.5" r="8" {...S} /><path d="M12 8.5v4.5l3 2M9.5 2.5h5" {...S} /></>,
  user: <><circle cx="12" cy="8" r="3.8" {...S} /><path d="M4.5 20.5c.8-4 3.8-6.2 7.5-6.2s6.7 2.2 7.5 6.2" {...S} /></>,
  lock: <><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" {...S} /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" {...S} /></>,
  book: <path d="M12 6.5C10 5 7.5 4.5 3.5 4.5v14c4 0 6.5.5 8.5 2 2-1.5 4.5-2 8.5-2v-14c-4 0-6.5.5-8.5 2zM12 6.5v14" {...S} />,
  rocket: <path d="M12 2.5c3.5 2 5.5 5.8 5.5 10l-2 3.5h-7l-2-3.5c0-4.2 2-8 5.5-10zM8.5 13l-3 2.5 1 4.5 3-2.5M15.5 13l3 2.5-1 4.5-3-2.5M12 9.5h.01M10 19.5l2 2 2-2" {...S} />,
  globe: <><circle cx="12" cy="12" r="9" {...S} /><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" {...S} /></>,
  arrow: <path d="M5 12h13.5M13 6l6 6-6 6" {...S} />,
  pause: <path {...F} d="M6.5 4.5h3.5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM14 4.5h3.5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H14a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z" />,
  expand: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" {...S} />,
  infinity: <path d="M7.2 8.8a3.2 3.2 0 1 0 0 6.4c2.1 0 3.2-1.6 4.8-3.2s2.7-3.2 4.8-3.2a3.2 3.2 0 1 1 0 6.4c-2.1 0-3.2-1.6-4.8-3.2S9.3 8.8 7.2 8.8z" {...S} />,
  versus: <path d="M4 4l9.5 9.5M4 4h4.5M4 4v4.5M20 4l-9.5 9.5M20 4h-4.5M20 4v4.5M7.5 15.5l-3.5 3.5M16.5 15.5l3.5 3.5M6 13.5l4.5 4.5M18 13.5L13.5 18" {...S} />,
};

export const ICONS = Object.keys(PATHS);

export default function Icon({ name, size = 22, stroke = 2.4, className = "", style, title }) {
  const shapes = PATHS[name];
  if (!shapes) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} strokeWidth={stroke}
      className={`ico${className ? " " + className : ""}`} style={style}
      aria-hidden={title ? undefined : "true"} role={title ? "img" : undefined} aria-label={title}>
      {shapes}
    </svg>
  );
}
