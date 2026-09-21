import './style.css';
import { Application, Graphics } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import gsap from 'gsap';
import { palette } from './design/palette';
import { breathe, durations, easings } from './design/motion';

async function main() {
  const app = new Application();
  await app.init({
    resizeTo: window,
    backgroundColor: palette.void,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  document.querySelector<HTMLDivElement>('#app')!.appendChild(app.canvas);

  const dot = new Graphics().circle(0, 0, 24).fill({ color: palette.mint });
  dot.filters = [
    new GlowFilter({ color: palette.mint, distance: 40, outerStrength: 2, innerStrength: 0 }),
  ];
  dot.x = app.screen.width / 2;
  dot.y = app.screen.height / 2;
  app.stage.addChild(dot);

  window.addEventListener('resize', () => {
    dot.x = app.screen.width / 2;
    dot.y = app.screen.height / 2;
  });

  gsap.to(dot.scale, {
    x: breathe.scaleTo,
    y: breathe.scaleTo,
    duration: durations.breathe,
    ease: easings.ambient,
    yoyo: true,
    repeat: -1,
  });
}

main();
