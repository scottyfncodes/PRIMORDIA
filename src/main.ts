import './style.css';
import { Game, META_SWAP, type InputState } from './game/game';
import { Renderer } from './render/renderer';
import { Input } from './engine/input';
import { Audio } from './engine/audio';
import { UI } from './ui/ui';
import { RunStore, snapshot } from './game/save';
import { PLAYER_SPAWN } from './sim/environment';
import { TRAIT_BY_ID } from './game/traits';
import { buzz } from './engine/haptics';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game();
const renderer = new Renderer(canvas);
// adaptive quality: remember a lowered render resolution between sessions
const QUALITY_KEY = 'primordia.maxDpr';
try { const q = parseFloat(localStorage.getItem(QUALITY_KEY) || ''); if (q >= 1 && q <= 2) { renderer.maxDpr = q; renderer.resize(); } } catch { /* storage unavailable */ }
let frameEma = 16, slowT = 0, perfWarmup = 3;
function watchPerformance(rawDt: number) {
  if (document.hidden || game.state !== 'playing') { slowT = 0; return; }
  if (perfWarmup > 0) { perfWarmup -= rawDt; return; }
  frameEma += (rawDt * 1000 - frameEma) * 0.05;
  slowT = frameEma > 24 ? slowT + rawDt : 0;
  if (slowT > 2.5) {
    slowT = 0; perfWarmup = 3; frameEma = 16;
    if (renderer.degrade()) { try { localStorage.setItem(QUALITY_KEY, String(renderer.maxDpr)); } catch { /* ignore */ } }
  }
}
const audio = new Audio();
const input = new Input(document.getElementById('touch')!, document.getElementById('joy')!, document.getElementById('joy-knob')!);
input.mode = game.progress.data.settings.controls;
audio.enabled = game.progress.data.settings.sound;
audio.musicOn = game.progress.data.settings.music;

const runStore = RunStore.fromWindow();
const ui = new UI(game, audio, input, {
  onStart: () => startRun(),
  onRestart: () => startRun(),
  onContinue: () => continueRun(),
  savedRun: () => runStore.load(),
  onQuitToTitle: () => toTitle(game.state === 'paused'),
  onSaveAndExit: () => toTitle(false),
});

let lastState = game.state;
const hudEl = document.getElementById('hud')!;
let deathTimer = -1;
const inputState: InputState = { mx: 0, my: 0, burst: false, abilities: {} };

function beginPlay() {
  renderer.snapCamera(game);
  input.reset();
  input.enabled = true;
  ui.showHud(true);
  lastState = 'playing';
  deathTimer = -1;
  autosaveT = 2;
  audio.setEra(game.player.eraIndex);
}

function continueRun() {
  const s = runStore.load();
  if (!s) return startRun();
  audio.unlock();
  ui.closeScreen();
  renderer.fx.clear();
  game.resumeRun(s);
  beginPlay();
  renderer.cam.zoom *= 0.7;
}

/** Save the current life (only while it is in progress). */
function autosave() {
  if (game.player.alive && ['playing', 'paused', 'evolve', 'leap'].includes(game.state) || (game.state === 'metamorph' && game.metaT >= META_SWAP)) runStore.save(snapshot(game));
}
let autosaveT = 4;

function startRun() {
  audio.unlock();
  ui.closeScreen();
  renderer.fx.clear();
  runStore.clear();
  renderer.food.length = 0;
  renderer.scans.length = 0;
  game.newRun();
  renderer.snapCamera(game);
  renderer.cam.zoom *= 0.6; // gentle zoom-in reveal
  input.reset();
  input.enabled = true;
  ui.showHud(true);
  lastState = 'playing';
  deathTimer = -1;
  autosaveT = 4;
  audio.setEra(1);
}

function toTitle(abandon = false) {
  if (abandon) runStore.clear(); else autosave();
  game.progress.flush();
  input.enabled = false;
  input.reset();
  game.startAttract();
  audio.setEra(1);
  ui.showTitle();
  lastState = 'title';
}

// title attract camera drift
let attractT = 0;

function handleEvents() {
  const p = game.player;
  const fx = renderer.fx;
  const z = renderer.cam.zoom;
  const textSize = 15 / z;
  const haptics = game.progress.data.settings.haptics;
  for (const e of game.events) {
    ui.handleEvent(e);
    if (haptics) {
      if (e.type === 'bite' && !e.blocked) buzz(35);
      else if (e.type === 'leap') buzz([30, 60, 30, 60, 90]);
      else if (e.type === 'death') buzz([80, 50, 160]);
      else if (e.type === 'strikeHit' && e.kill) buzz(20);
      else if (e.type === 'revive') buzz([40, 40, 40]);
    }
    switch (e.type) {
      case 'eat':
        fx.burst(e.x, e.y, 10 + Math.min(20, Math.round(e.r)), e.color, e.r * 4, e.r * 0.35);
        fx.ring(e.x, e.y, e.r, e.r * 2.6, e.color, 0.45);
        fx.text(e.x, e.y - e.r, e.dna ? `+${e.dna} DNA` : `+${Math.round(e.energy)}`, e.dna ? '#ffd166' : '#aaffe8', textSize * (e.dna ? 1.1 : 0.9));
        if (e.toxic) fx.text(e.x, e.y + e.r, 'Toxic!', '#d78bff', textSize);
        renderer.addFood(e.color, e.r / p.r);
        fx.debris(e.x, e.y, 5, e.species.look.membrane, e.r);
        audio.eat(e.r / p.r);
        break;
      case 'absorb':
        if (e.kind === 'dna') { fx.burst(e.x, e.y, 8, '#ffd166', p.r * 1.5, p.r * 0.12); fx.text(e.x, e.y - p.r * 0.4, `+${e.dna} DNA`, '#ffd166', textSize); }
        else if (Math.random() < 0.6) fx.burst(e.x, e.y, 2, '#9cffe6', p.r * 0.8, p.r * 0.07);
        audio.absorb(e.kind === 'dna');
        break;
      case 'bite':
        if (e.blocked) { fx.ring(e.x, e.y, p.r, p.r * 2.2, '#fff2c0', 0.4); audio.blocked(); }
        else { fx.shards(e.x, e.y, 10, '#ff6b6b', p.r * 5, p.r * 0.12); renderer.cam.shake = Math.min(1.2, 0.5 + e.dmg / 40); audio.bite(); fx.text(e.x, e.y - p.r * 1.2, `−${Math.round(e.dmg)}`, '#ff8a8a', textSize); }
        break;
      case 'reflect':
        fx.burst(e.x, e.y, 14, '#ffffff', p.r * 6, p.r * 0.12);
        fx.ring(e.x, e.y, p.r * 0.5, p.r * 2, '#ffffff', 0.35);
        audio.blocked();
        break;
      case 'bounce':
        fx.ring(e.x, e.y, p.r * 0.4, p.r * 1.3, e.reason === 'size' ? '#ffffff' : '#d9b8ff', 0.3);
        if (e.reason === 'size') game.hint('bigger', 'Too big to swallow — grow larger, or evolve Pseudopods to engulf it', true);
        audio.bounce();
        break;
      case 'spiny':
        fx.shards(e.x, e.y, 6, '#d9b8ff', p.r * 4, p.r * 0.1);
        renderer.cam.shake = 0.35;
        audio.spiny();
        break;
      case 'burst':
        fx.bubbles(e.x - Math.cos(e.angle) * p.r, e.y - Math.sin(e.angle) * p.r, 6, p.r * 0.6);
        audio.burst();
        break;
      case 'ability':
        if (e.id === 'pulse') fx.ring(e.x, e.y, p.r, p.r * 16, '#fff4c0', 1.1);
        if (e.id === 'toxin') fx.burst(e.x, e.y, 30, '#c77dff', p.r * 5, p.r * 0.3);
        if (e.id === 'harden') fx.ring(e.x, e.y, p.r * 1.6, p.r * 1.1, '#fff2c0', 0.4);
        if (e.id === 'engulf') fx.ring(e.x, e.y, p.r, p.r * 1.6, p.look.membrane, 0.3);
        if (e.id === 'strike') fx.bubbles(e.x, e.y, 8, p.r * 0.5);
        if (e.id === 'ink') fx.bubbles(e.x, e.y, 10, p.r * 0.6);
        audio.ability(e.id);
        break;
      case 'mutation': {
        const t = TRAIT_BY_ID[e.traitId];
        renderer.evolveFlash = 0.8;
        fx.burst(p.x, p.y, 40, p.look.glow, p.r * 7, p.r * 0.25);
        fx.ring(p.x, p.y, p.r, p.r * 5, p.look.membrane, 0.9);
        fx.text(p.x, p.y - p.r * 2, t.levels[e.level - 1].name, '#ffffff', textSize * 1.3);
        fx.gene(p.x, p.y, 14, ['#ffd166', p.look.glow], p.r * 4.5, 1.2);
        audio.mutation();
        break;
      }
      case 'leap':
        renderer.evolveFlash = 1.2;
        renderer.cam.shake = 0.6;
        fx.burst(p.x, p.y, 70, p.look.glow, p.r * 9, p.r * 0.3);
        fx.ring(p.x, p.y, p.r, p.r * 9, '#ffffff', 1.4);
        fx.gene(p.x, p.y, 24, ['#ffd166', p.look.glow, '#ffffff'], p.r * 7, 1.6);
        renderer.cam.x = p.x; renderer.cam.y = p.y; // the sea may have been rescaled
        audio.setEra(e.era);
        autosave();
        // pull back to reveal the bigger world (a metamorphosis keeps the camera close on the new body)
        renderer.cam.zoom = renderer.bodyZoom(game) * (game.state === 'metamorph' ? 1.25 : 1.9);
        fx.shards(p.x, p.y, 26, p.look.membrane, p.r * 5, p.r * 0.16);
        audio.leap();
        break;
      case 'discover':
        if (e.kind === 'species' && e.org) renderer.scan(e.org, e.title);
        if (e.kind === 'species') audio.discover(); else audio.chime();
        break;
      case 'death':
        fx.burst(p.x, p.y, 50, p.look.glow, p.r * 6, p.r * 0.3);
        fx.shards(p.x, p.y, 24, p.look.membrane, p.r * 4, p.r * 0.2);
        renderer.cam.shake = 1;
        audio.death();
        break;
      case 'npcEat':
        if (Math.hypot(e.x - p.x, e.y - p.y) < renderer.viewRadiusWorld()) fx.burst(e.x, e.y, 5, '#ffb0a0', e.r * 2, e.r * 0.25);
        break;
      case 'npcDie':
        fx.burst(e.x, e.y, 10, e.color, e.r * 3, e.r * 0.3);
        if (Math.hypot(e.x - p.x, e.y - p.y) < renderer.viewRadiusWorld()) fx.debris(e.x, e.y, 7, e.color, e.r);
        break;
      case 'heat':
        fx.bubbles(e.x, e.y, 3, p.r * 0.5);
        audio.heat();
        break;
      case 'strikeHit':
        fx.shards(e.x, e.y, 14, '#ffe0c0', e.r * 4, e.r * 0.12);
        fx.ring(e.x, e.y, e.r * 0.6, e.r * 1.8, '#ffffff', 0.35);
        renderer.cam.shake = Math.max(renderer.cam.shake, 0.45);
        audio.strike(e.kill);
        if (!e.kill) fx.text(e.x, e.y - e.r, 'Wounded', '#ffd0b0', textSize);
        break;
      case 'tongue':
        fx.beam(e.x1, e.y1, e.x2, e.y2, '#ff8aa0', p.r * 0.09, 0.3);
        audio.ability('tongue');
        break;
      case 'revive':
        renderer.evolveFlash = 0.9;
        fx.burst(e.x, e.y, 50, '#fff4d0', p.r * 6, p.r * 0.25);
        fx.ring(e.x, e.y, p.r, p.r * 6, '#ffd27a', 1.2);
        audio.mutation();
        deathTimer = -1;
        break;
      case 'grow':
        // a visible growth step: the membrane swells outward in a ring of light
        p.growPulse = 1;
        fx.ring(p.x, p.y, p.r * 1.05, p.r * 2.4, p.look.membrane, 0.7);
        fx.ring(p.x, p.y, p.r * 0.9, p.r * 1.6, '#c9a8ff', 0.5);
        fx.burst(p.x, p.y, 16, '#c9a8ff', p.r * 3, p.r * 0.1);
        audio.grow(e.stage);
        break;
      case 'satellitePop':
        fx.burst(e.x, e.y, 12, p.look.glow, p.r * 3, p.r * 0.15);
        audio.blocked();
        break;
    }
  }
  game.events.length = 0;
}

let last = performance.now();
const STEP = 1 / 60;
let acc = 0;

function frame(now: number) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0 && dt < 0.5) watchPerformance(dt);
  if (dt > 0.1) dt = 0.1;
  if (dt < 0) dt = 0;

  game.viewR = renderer.viewRadiusWorld();

  if (game.state === 'title') {
    attractT += dt;
    const cx = PLAYER_SPAWN.x + Math.sin(attractT * 0.05) * 600, cy = PLAYER_SPAWN.y + Math.cos(attractT * 0.037) * 300;
    renderer.cam.x = cx; renderer.cam.y = cy;
    renderer.cam.zoom = renderer.screenPlayerR() / 14;
    game.updateAttract(dt, cx, cy);
  } else {
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      input.read(inputState);
      game.update(STEP, inputState);
      acc -= STEP;
      steps++;
      if (game.state !== 'playing' && game.state !== 'metamorph') { acc = 0; break; }
    }
    if (steps >= 5) acc = 0;
    if (game.state === 'playing' || game.state === 'dead' || game.state === 'metamorph') renderer.updateCamera(game, dt);
    handleEvents();
  }

  // state transitions → screens
  if (game.state !== lastState) {
    if (game.state === 'evolve') { ui.showEvolve(); input.reset(); }
    else if (game.state === 'leap') { ui.showLeap(); input.reset(); }
    else if (game.state === 'dead') { deathTimer = 1.6; input.enabled = false; input.reset(); runStore.clear(); }
    else if (game.state === 'metamorph') { input.reset(); audio.metamorph(game.metaEra); }
    else if (game.state === 'playing' && (lastState === 'evolve' || lastState === 'leap' || lastState === 'metamorph')) { input.reset(); }
    lastState = game.state;
  }
  if (deathTimer > 0) {
    deathTimer -= dt;
    if (deathTimer <= 0) { ui.showHud(false); ui.showDeath(); }
  }

  const p = game.player;
  // drag-to-move needs the player's on-screen position
  input.playerScreen.x = renderer.w / 2 + (p.x - renderer.cam.x) * renderer.cam.zoom;
  input.playerScreen.y = renderer.h / 2 + (p.y - renderer.cam.y) * renderer.cam.zoom;
  input.playerScreen.r = p.r * renderer.cam.zoom;

  renderer.render(game, dt);
  if (game.state !== 'title') { ui.updateHud(dt); ui.setScale(renderer.cam.zoom, p.eraIndex); }
  hudEl.classList.toggle('dim', game.state !== 'playing');
  ui.tick(now / 1000);
  audio.setPlace(game.currentZone, game.player.eraIndex);
  audio.update(dt, game.state === 'playing' ? game.danger : 0, game.env.light(renderer.cam.x, renderer.cam.y), renderer.cam.y / game.env.h, game.state === 'playing', game.state !== 'title' && game.player.onLand);
  if (game.state === 'playing') {
    autosaveT -= dt;
    if (autosaveT <= 0) { autosaveT = 5; autosave(); }
  }
}

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 200));
// iOS: resume audio when returning to the app or on the next touch after an interruption
const wakeAudio = () => audio.wake();
document.addEventListener('touchstart', wakeAudio, { capture: true, passive: true });
document.addEventListener('mousedown', wakeAudio, { capture: true });
window.addEventListener('pageshow', wakeAudio);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) wakeAudio();
  if (document.hidden && game.state === 'playing') { ui.togglePause(); }
  if (document.hidden) { autosave(); game.progress.flush(); }
});
window.addEventListener('pagehide', () => { autosave(); game.progress.flush(); });

// expose for automated testing / debugging
(window as unknown as { __primordia: unknown }).__primordia = { game, renderer, ui, input, startRun };

toTitle();
renderer.snapCamera(game);
requestAnimationFrame(frame);
