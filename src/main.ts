import './style.css';
import { Application, Container, FillGradient, Graphics } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import gsap from 'gsap';
import { palette } from './design/palette';
import { easings, heroBreathe } from './design/motion';

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

  const root = new Container();
  app.stage.addChild(root);

  const haloGradient = new FillGradient({
    type: 'radial',
    center: { x: 0.5, y: 0.5 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.5,
    textureSize: 512,
    colorStops: [
      { offset: 0, color: palette.mint },
      { offset: 0.35, color: palette.mint },
      { offset: 1, color: palette.void },
    ],
  });
  const halo = new Graphics().circle(0, 0, 90).fill(haloGradient);
  halo.blendMode = 'screen';
  halo.alpha = heroBreathe.haloFrom;

  const dot = new Graphics().circle(0, 0, 24).fill({ color: palette.mint });
  const glow = new GlowFilter({
    color: palette.mint,
    distance: 48,
    outerStrength: heroBreathe.glowFrom,
    innerStrength: 0,
    quality: 0.4,
  });
  glow.resolution = 'inherit';
  glow.antialias = 'inherit';
  dot.filters = [glow];

  root.addChild(halo, dot);

  const center = () => {
    root.x = app.screen.width / 2;
    root.y = app.screen.height / 2;
  };
  center();
  window.addEventListener('resize', center);

  gsap
    .timeline({ repeat: -1 })
    .to(dot.scale, {
      x: heroBreathe.scaleTo,
      y: heroBreathe.scaleTo,
      duration: heroBreathe.inhale,
      ease: easings.ambient,
    })
    .to(glow, { outerStrength: heroBreathe.glowTo, duration: heroBreathe.inhale, ease: easings.ambient }, 0)
    .to(halo, { alpha: heroBreathe.haloTo, duration: heroBreathe.inhale, ease: easings.ambient }, 0)
    .to(halo.scale, { x: heroBreathe.haloScaleTo, y: heroBreathe.haloScaleTo, duration: heroBreathe.inhale, ease: easings.ambient }, 0)
    .to(dot.scale, {
      x: heroBreathe.scaleFrom,
      y: heroBreathe.scaleFrom,
      duration: heroBreathe.exhale,
      ease: easings.ambient,
    })
    .to(glow, { outerStrength: heroBreathe.glowFrom, duration: heroBreathe.exhale, ease: easings.ambient }, '<')
    .to(halo, { alpha: heroBreathe.haloFrom, duration: heroBreathe.exhale, ease: easings.ambient }, '<')
    .to(halo.scale, { x: heroBreathe.scaleFrom, y: heroBreathe.scaleFrom, duration: heroBreathe.exhale, ease: easings.ambient }, '<');
}

main();
