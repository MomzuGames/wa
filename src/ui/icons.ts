import { Graphics } from 'pixi.js';

// All icons are drawn centred on (0,0) inside a box of `size` px, stroked in `color`.
export type IconName = 'settings' | 'back' | 'speaker' | 'speakerOff' | 'note' | 'sparkle' | 'leaf' | 'restart' | 'play' | 'help' | 'hint' | 'yes' | 'no' | 'account';

export function drawIcon(g: Graphics, name: IconName, size: number, color: number): Graphics {
  const s = size / 2;
  const stroke = { color, width: Math.max(1.5, size * 0.07), cap: 'round' as const, join: 'round' as const };
  g.clear();
  switch (name) {
    case 'settings': {
      g.circle(0, 0, s * 0.28).stroke(stroke);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.moveTo(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55)
          .lineTo(Math.cos(a) * s * 0.85, Math.sin(a) * s * 0.85)
          .stroke(stroke);
      }
      break;
    }
    case 'back':
      g.moveTo(s * 0.3, -s * 0.6).lineTo(-s * 0.35, 0).lineTo(s * 0.3, s * 0.6).stroke(stroke);
      break;
    case 'speaker':
    case 'speakerOff': {
      g.moveTo(-s * 0.7, -s * 0.28)
        .lineTo(-s * 0.35, -s * 0.28)
        .lineTo(s * 0.05, -s * 0.65)
        .lineTo(s * 0.05, s * 0.65)
        .lineTo(-s * 0.35, s * 0.28)
        .lineTo(-s * 0.7, s * 0.28)
        .closePath()
        .stroke(stroke);
      if (name === 'speaker') {
        g.arc(s * 0.15, 0, s * 0.35, -Math.PI / 4, Math.PI / 4).stroke(stroke);
        g.arc(s * 0.15, 0, s * 0.62, -Math.PI / 4, Math.PI / 4).stroke(stroke);
      } else {
        g.moveTo(s * 0.3, -s * 0.3).lineTo(s * 0.75, s * 0.3).stroke(stroke);
        g.moveTo(s * 0.75, -s * 0.3).lineTo(s * 0.3, s * 0.3).stroke(stroke);
      }
      break;
    }
    case 'note':
      g.moveTo(-s * 0.1, s * 0.4).lineTo(-s * 0.1, -s * 0.65).lineTo(s * 0.5, -s * 0.45).stroke(stroke);
      g.circle(-s * 0.35, s * 0.42, s * 0.26).stroke(stroke);
      break;
    case 'sparkle':
      g.moveTo(0, -s * 0.8).lineTo(0, s * 0.8).stroke(stroke);
      g.moveTo(-s * 0.8, 0).lineTo(s * 0.8, 0).stroke(stroke);
      g.moveTo(-s * 0.45, -s * 0.45).lineTo(s * 0.45, s * 0.45).stroke(stroke);
      g.moveTo(s * 0.45, -s * 0.45).lineTo(-s * 0.45, s * 0.45).stroke(stroke);
      break;
    case 'leaf':
      g.moveTo(-s * 0.7, s * 0.7)
        .quadraticCurveTo(-s * 0.7, -s * 0.7, s * 0.7, -s * 0.7)
        .quadraticCurveTo(s * 0.7, s * 0.7, -s * 0.7, s * 0.7)
        .stroke(stroke);
      g.moveTo(-s * 0.7, s * 0.7).lineTo(s * 0.35, -s * 0.35).stroke(stroke);
      break;
    case 'account':
      g.circle(0, -s * 0.28, s * 0.28).stroke(stroke);
      g.arc(0, s * 0.75, s * 0.62, Math.PI * 1.15, Math.PI * 1.85).stroke(stroke);
      break;
    case 'help':
      g.arc(0, -s * 0.3, s * 0.32, Math.PI * 1.05, Math.PI * 2.35).stroke(stroke);
      g.moveTo(s * 0.1, -s * 0.02).quadraticCurveTo(0, s * 0.1, 0, s * 0.3).stroke(stroke);
      g.circle(0, s * 0.62, s * 0.06).fill({ color });
      break;
    case 'hint':
      g.arc(0, -s * 0.15, s * 0.42, Math.PI * 0.8, Math.PI * 2.2).stroke(stroke);
      g.moveTo(-s * 0.22, s * 0.28).lineTo(-s * 0.22, s * 0.5).lineTo(s * 0.22, s * 0.5).lineTo(s * 0.22, s * 0.28).stroke(stroke);
      g.moveTo(-s * 0.16, s * 0.68).lineTo(s * 0.16, s * 0.68).stroke(stroke);
      break;
    case 'yes':
      g.moveTo(-s * 0.5, s * 0.05).lineTo(-s * 0.15, s * 0.4).lineTo(s * 0.55, -s * 0.4).stroke(stroke);
      break;
    case 'no':
      g.moveTo(-s * 0.45, -s * 0.45).lineTo(s * 0.45, s * 0.45).stroke(stroke);
      g.moveTo(s * 0.45, -s * 0.45).lineTo(-s * 0.45, s * 0.45).stroke(stroke);
      break;
    case 'play':
      g.moveTo(-s * 0.35, -s * 0.5).lineTo(s * 0.5, 0).lineTo(-s * 0.35, s * 0.5).closePath().stroke(stroke);
      break;
    case 'restart':
      g.arc(0, 0, s * 0.62, -Math.PI * 0.35, Math.PI * 1.35).stroke(stroke);
      g.moveTo(s * 0.62 * Math.cos(-Math.PI * 0.35) - s * 0.3, s * 0.62 * Math.sin(-Math.PI * 0.35) - s * 0.05)
        .lineTo(s * 0.62 * Math.cos(-Math.PI * 0.35), s * 0.62 * Math.sin(-Math.PI * 0.35))
        .lineTo(s * 0.62 * Math.cos(-Math.PI * 0.35) - s * 0.05, s * 0.62 * Math.sin(-Math.PI * 0.35) + s * 0.32)
        .stroke(stroke);
      break;
  }
  return g;
}
