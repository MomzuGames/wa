import { cssHex, rgba } from '../design/palette';
import { studioCard as timing } from '../design/motion';
import { STUDIO_NAME } from '../config/game';

// The MomoGames card shown while the game loads: a punk baby with a pastel mohawk, a
// pacifier and a safety-pin earring, gripping a game controller. Drawn as inline SVG so it
// is crisp on every screen and on screen before the game's renderer has started.

const c = {
  skin: cssHex('peach'),
  spikeA: cssHex('rose'),
  spikeB: cssHex('lavender'),
  ink: cssHex('ink'),
  line: cssHex('void'),
  pad: cssHex('mint'),
  sky: cssHex('sky'),
  lemon: cssHex('lemon'),
  pearl: cssHex('pearl'),
};

// Mohawk spikes: base centre x, tip lean and tip height, from left to right.
const SPIKES: Array<[number, number, number]> = [
  [98, -10, 34],
  [109, -4, 20],
  [120, 0, 12],
  [131, 4, 20],
  [142, 10, 34],
];

const spikes = SPIKES.map(
  ([x, lean, tip], i) =>
    `<path class="spike" style="animation-delay:${(-i * timing.sway) / 5}s" d="M${x - 9} 78 L${x + lean} ${tip} L${x + 9} 78 Z" fill="${i % 2 ? c.spikeB : c.spikeA}"/>`,
).join('');

const LOGO = `
<svg viewBox="0 0 240 240" class="baby" aria-hidden="true">
  ${spikes}
  <circle cx="66" cy="124" r="12" fill="${c.skin}"/>
  <circle cx="174" cy="124" r="12" fill="${c.skin}"/>
  <circle cx="177" cy="141" r="5.5" fill="none" stroke="${c.pearl}" stroke-width="2"/>
  <circle cx="176" cy="127" r="2.2" fill="${c.pearl}"/>
  <circle cx="120" cy="118" r="54" fill="${c.skin}"/>
  <path d="M90 102 L108 107 M150 102 L132 107" stroke="${c.line}" stroke-width="3.5" stroke-linecap="round"/>
  <g class="eyes">
    <ellipse cx="101" cy="118" rx="4.5" ry="6" fill="${c.line}"/>
    <ellipse cx="139" cy="118" rx="4.5" ry="6" fill="${c.line}"/>
  </g>
  <ellipse cx="90" cy="134" rx="8" ry="5" fill="${c.spikeA}" opacity="0.7"/>
  <ellipse cx="150" cy="134" rx="8" ry="5" fill="${c.spikeA}" opacity="0.7"/>
  <circle cx="120" cy="159" r="7" fill="none" stroke="${c.sky}" stroke-width="3"/>
  <ellipse cx="120" cy="146" rx="15" ry="8" fill="${c.sky}"/>
  <circle cx="120" cy="146" r="3.5" fill="${c.pearl}"/>
  <path d="M80 172 H160 C185 172 196 188 194 206 C192 224 176 230 166 218 L156 206 H84 L74 218 C64 230 48 224 46 206 C44 188 55 172 80 172 Z"
        fill="${c.ink}" stroke="${c.pad}" stroke-width="3" stroke-linejoin="round"/>
  <rect x="76" y="187" width="18" height="5.5" rx="2" fill="${c.pad}"/>
  <rect x="82.25" y="180.75" width="5.5" height="18" rx="2" fill="${c.pad}"/>
  <circle class="btn" cx="154" cy="181" r="4" fill="${c.spikeA}"/>
  <circle class="btn" style="animation-delay:${-timing.twinkle / 4}s" cx="163" cy="190" r="4" fill="${c.lemon}"/>
  <circle class="btn" style="animation-delay:${(-timing.twinkle * 2) / 4}s" cx="154" cy="199" r="4" fill="${c.spikeB}"/>
  <circle class="btn" style="animation-delay:${(-timing.twinkle * 3) / 4}s" cx="145" cy="190" r="4" fill="${c.sky}"/>
  <circle cx="54" cy="200" r="11" fill="${c.skin}"/>
  <circle cx="186" cy="200" r="11" fill="${c.skin}"/>
</svg>`;

const css = `
.chowa-studio { position: fixed; inset: 0; z-index: 30; display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: ${cssHex('void')}; opacity: 1; transition: opacity ${timing.fadeOut}s ease; }
.chowa-studio.gone { opacity: 0; pointer-events: none; }
.chowa-studio .mark { display: flex; flex-direction: column; align-items: center; opacity: 0; transform: scale(.92);
  transition: opacity ${timing.fadeIn}s ease, transform ${timing.fadeIn}s cubic-bezier(.16,1,.3,1); }
.chowa-studio.in .mark { opacity: 1; transform: scale(1); }
.chowa-studio .baby { width: min(46vw, 210px); height: auto; overflow: visible;
  filter: drop-shadow(0 0 18px ${rgba('peach', 0.25)}); animation: chowa-studio-bob ${timing.bob}s ease-in-out infinite; }
.chowa-studio .spike { transform-box: fill-box; transform-origin: 50% 100%; animation: chowa-studio-sway ${timing.sway}s ease-in-out infinite alternate; }
.chowa-studio .eyes { transform-box: fill-box; transform-origin: 50% 50%; animation: chowa-studio-blink ${timing.blink}s infinite; }
.chowa-studio .btn { animation: chowa-studio-twinkle ${timing.twinkle}s ease-in-out infinite; }
.chowa-studio .name { margin-top: 22px; font-family: Quicksand, sans-serif; font-weight: 300; font-size: 22px; letter-spacing: 5px;
  color: ${cssHex('pearl')}; opacity: .85; padding-left: 5px; }
@keyframes chowa-studio-sway { from { transform: rotate(-7deg); } to { transform: rotate(7deg); } }
@keyframes chowa-studio-blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(.1); } }
@keyframes chowa-studio-twinkle { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
@keyframes chowa-studio-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@media (prefers-reduced-motion: reduce) { .chowa-studio * { animation: none !important; } }
`;

export interface StudioCard {
  // Resolves once the logo has had its moment, or sooner when the player taps.
  held: Promise<void>;
  // Fades the card away to show the game beneath.
  dismiss(): void;
}

export function showStudioCard(): StudioCard {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.className = 'chowa-studio';
  root.innerHTML = `<div class="mark">${LOGO}<div class="name">${STUDIO_NAME}</div></div>`;
  document.body.appendChild(root);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('in')));

  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
    setTimeout(resolve, (timing.fadeIn + timing.hold) * 1000);
  });
  // A tap skips the wait, but never before the logo has appeared.
  setTimeout(() => root.addEventListener('pointerdown', () => release(), { once: true }), timing.fadeIn * 1000);

  return {
    held,
    dismiss() {
      root.classList.add('gone');
      setTimeout(() => {
        root.remove();
        style.remove();
      }, timing.fadeOut * 1000);
    },
  };
}
