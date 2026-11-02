import type { Game, GameEvent } from '../game/game';
import { MILESTONES } from '../game/game';
import { ABILITY_INFO, TRAITS, TRAIT_BY_ID, type AbilityId, type Archetype, type Offer } from '../game/traits';
import { ARCHETYPE_INFO, ERAS, FORMS, FORM_BY_ID, MAX_PLAYABLE_ERA, formFor, type FormDef } from '../game/eras';
import { buildPlayerLook, type Player } from '../game/player';
import { SPECIES, SPECIES_BY_ID, type SpeciesDef } from '../sim/species';
import { ZONES, type ZoneId } from '../sim/environment';
import { PreviewCanvas, previewScale, staticPreview } from './preview';
import { behaviour, characteristics, cladeOf, habitat, relations, specimenNo } from '../game/codex';
import type { Audio } from '../engine/audio';
import type { Input } from '../engine/input';
import type { RunSnapshot } from '../game/save';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const h = (tag: string, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const CATEGORY_LABEL: Record<string, string> = { harmless: 'Harmless', prey: 'Prey', competitor: 'Competitor', predator: 'Predator', rare: 'Rare' };
const ARCH_ORDER: Archetype[] = ['predator', 'defender', 'opportunist', 'phototroph'];
const ARCH_SHORT: Record<Archetype, string> = { predator: 'Predator', defender: 'Defender', opportunist: 'Forager', phototroph: 'Phototroph' };
/** micrometres per world unit at each era (bodies are measured in world units) */
const UM_PER_UNIT = [0.25, 0.6, 3, 40, 400, 1500];

function fmtLength(um: number) {
  if (um < 1000) return `${um} µm`;
  if (um < 10000) return `${um / 1000} mm`;
  if (um < 1e6) return `${um / 10000} cm`;
  return `${um / 1e6} m`;
}

/** Look of the player's lineage at the end of each era of this life. */
function lineageLooks(p: Player) {
  const traits: Record<string, number> = {};
  return p.history.map((h) => {
    for (const id of h.traits) traits[id] = (traits[id] || 0) + 1;
    const form = FORM_BY_ID[h.formId] || formFor(1, 'opportunist');
    return { h, form, look: buildPlayerLook({ ...traits }, h.era, form) };
  });
}

export interface UiCallbacks {
  onStart: () => void;
  onContinue: () => void;
  savedRun: () => RunSnapshot | null;
  onRestart: () => void;
  onQuitToTitle: () => void;
  onSaveAndExit: () => void;
}

export class UI {
  private hud = $('hud');
  private screens = $('screens');
  private energyFill = $('energy-fill');
  private hpFill = $('hp-fill');
  private growthFill = $('growth-fill');
  private breathBar = $('breath-bar');
  private breathFill = $('breath-fill');
  private growthLabel = $('growth-label');
  private dnaCount = $('dna-count');
  private dnaBtn = $('dna-btn');
  private formName = $('form-name');
  private eraChip = $('era-chip');
  private abilityWrap = $('ability-btns');
  private burstBtn = $('burst-btn');
  private hintEl = $('hint');
  private toasts = $('toasts');
  private zoneLabel = $('zone-label');
  private abilityBtns = new Map<AbilityId, HTMLButtonElement>();
  private abilityKey = '';
  private previews: PreviewCanvas[] = [];
  private toastPreviews: PreviewCanvas[] = [];
  private scaleEl = $('scalebar');
  private eraCard = $('era-card');
  private scaleKey = '';
  private hintTimer = 0;
  private hintQueue: string[] = [];
  private last = { e: -1, hp: -1, g: -1, dna: -1, form: '', era: -1, evolve: false, zone: '' };
  current: string | null = null;

  constructor(private game: Game, private audio: Audio, private input: Input, private cb: UiCallbacks) {
    this.burstBtn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.input.pressBurst(); this.pressFx(this.burstBtn); }, { passive: false });
    this.burstBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); this.input.pressBurst(); this.pressFx(this.burstBtn); });
    const openEvolve = (e: Event) => {
      e.preventDefault(); e.stopPropagation();
      if (this.game.state === 'playing' && this.game.offers.length) { this.game.openEvolve(); }
    };
    this.dnaBtn.addEventListener('touchstart', openEvolve, { passive: false });
    this.dnaBtn.addEventListener('mousedown', openEvolve);
    const pause = (e: Event) => { e.preventDefault(); e.stopPropagation(); this.togglePause(); };
    $('pause-btn').addEventListener('touchstart', pause, { passive: false });
    $('pause-btn').addEventListener('mousedown', pause);
    this.input.onPause = () => this.togglePause();
    this.input.onEvolveKey = () => { if (this.game.state === 'playing') this.game.openEvolve(); };
  }

  private pressFx(el: HTMLElement) {
    el.classList.remove('pressed');
    void el.offsetWidth;
    el.classList.add('pressed');
  }

  togglePause() {
    if (this.game.state === 'playing') { this.game.pause(); this.showPause(); }
    else if (this.game.state === 'paused') { this.game.resume(); this.closeScreen(); }
  }

  // ───────────────────────── HUD ─────────────────────────
  showHud(on: boolean) { this.hud.hidden = !on; }

  /** Micrograph-style scale bar: a round length that spans ~70px at the current zoom. */
  setScale(pxPerUnit: number, era: number) {
    const umPerPx = (UM_PER_UNIT[era - 1] ?? 1) / Math.max(0.0001, pxPerUnit);
    const raw = 70 * umPerPx;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const nice = [1, 2, 5, 10].map((k) => k * mag).reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a));
    const px = Math.round(nice / umPerPx);
    const key = `${px}|${nice}`;
    if (key === this.scaleKey) return;
    this.scaleKey = key;
    (this.scaleEl.firstElementChild as HTMLElement).style.width = px + 'px';
    this.scaleEl.lastElementChild!.textContent = fmtLength(+nice.toPrecision(3));
  }

  private showEraCard(era: number) {
    const e = ERAS[era - 1];
    if (!e) return;
    this.eraCard.innerHTML = `<div class="ec-k">Era ${e.numeral}</div><div class="ec-t">${e.name}</div><div class="ec-s">${e.subtitle}</div>`;
    this.eraCard.classList.remove('show'); void this.eraCard.offsetWidth; this.eraCard.classList.add('show');
  }

  updateHud(dt: number) {
    const g = this.game, p = g.player, L = this.last;
    const e = Math.round((p.energy / p.maxEnergy) * 200) / 2;
    if (e !== L.e) { L.e = e; this.energyFill.style.transform = `scaleX(${e / 100})`; this.energyFill.parentElement!.classList.toggle('low', e < 22); }
    const hp = Math.round((p.hp / p.maxHp) * 200) / 2;
    if (hp !== L.hp) { L.hp = hp; this.hpFill.style.transform = `scaleX(${Math.max(0, hp) / 100})`; this.hpFill.parentElement!.classList.toggle('low', hp < 30); }
    const showBreath = g.env.land;
    if (this.breathBar.hidden === showBreath) this.breathBar.hidden = !showBreath;
    if (showBreath) {
      this.breathFill.style.transform = `scaleX(${Math.max(0, p.breath)})`;
      this.breathBar.classList.toggle('low', p.breath < 0.35);
    }
    const gf = Math.round(p.growthFrac * 200) / 2;
    if (gf !== L.g || p.eraIndex !== L.era) {
      L.g = gf;
      this.growthFill.style.transform = `scaleX(${gf / 100})`;
      const next = ERAS[p.eraIndex];
      if (p.eraIndex < MAX_PLAYABLE_ERA && next) {
        const need = p.era.mutationsToLeap - p.mutationCount;
        this.growthLabel.textContent = gf >= 100 ? (need > 0 ? `${need} more mutation${need > 1 ? 's' : ''} to leap` : `Ready for Era ${next.numeral}`) : `Growth → Era ${next.numeral}`;
      } else {
        this.growthLabel.textContent = gf >= 100 ? 'Cambrian frontier reached' : 'Growth → Frontier';
      }
    }
    if (p.dna !== L.dna) { L.dna = p.dna; this.dnaCount.textContent = String(p.dna); }
    const evolve = g.evolveAvailable;
    if (evolve !== L.evolve) { L.evolve = evolve; this.dnaBtn.classList.toggle('ready', evolve); }
    if (p.form.name !== L.form || p.eraIndex !== L.era) {
      L.form = p.form.name; L.era = p.eraIndex;
      this.formName.textContent = p.form.name;
      this.eraChip.textContent = `Era ${p.era.numeral}`;
    }
    const zn = ZONES[g.currentZone].name;
    if (zn !== L.zone) { L.zone = zn; this.zoneLabel.textContent = zn; this.zoneLabel.classList.remove('flash'); void this.zoneLabel.offsetWidth; this.zoneLabel.classList.add('flash'); }

    // abilities
    const key = p.stats.abilities.join(',');
    if (key !== this.abilityKey) { this.abilityKey = key; this.buildAbilities(p.stats.abilities); }
    for (const [id, btn] of this.abilityBtns) {
      const cd = Math.max(0, p.cooldowns[id]);
      const info = ABILITY_INFO[id];
      const frac = cd > 0 ? cd / info.cooldown : 0;
      btn.style.setProperty('--cd', String(frac));
      btn.classList.toggle('cooling', cd > 0);
    }
    this.burstBtn.style.setProperty('--cd', String(Math.max(0, p.burstCd / 0.85)));

    // hints
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) { this.hintEl.classList.remove('show'); }
    } else if (this.hintQueue.length) {
      this.hintEl.textContent = this.hintQueue.shift()!;
      this.hintEl.classList.add('show');
      this.hintTimer = 4.8;
    }
  }

  private buildAbilities(ids: AbilityId[]) {
    this.abilityWrap.innerHTML = '';
    this.abilityBtns.clear();
    this.input.slots = ids.slice();
    ids.forEach((id, i) => {
      const info = ABILITY_INFO[id];
      const b = h('button', `act ability a-${id}`, `<span class="ic">${info.icon}</span><span class="lb">${info.name}</span>`) as HTMLButtonElement;
      // arrange in two arcs around the Burst button (centre 42px from the corner)
      const ring = i < 3 ? 0 : 1;
      const R = ring === 0 ? 96 : 160;
      const deg = ring === 0 ? [8, 50, 92][i] : [16, 42, 68][i - 3];
      const a = (deg * Math.PI) / 180;
      b.style.right = `${42 + Math.cos(a) * R - 29}px`;
      b.style.bottom = `${42 + Math.sin(a) * R - 29}px`;
      const fire = (e: Event) => { e.preventDefault(); e.stopPropagation(); this.input.pressAbility(id); this.pressFx(b); };
      b.addEventListener('touchstart', fire, { passive: false });
      b.addEventListener('mousedown', fire);
      this.abilityWrap.appendChild(b);
      this.abilityBtns.set(id, b);
    });
  }

  hint(text: string) {
    if (this.hintQueue.includes(text) || this.hintEl.textContent === text && this.hintTimer > 0) return;
    this.hintQueue.push(text);
    if (this.hintQueue.length > 3) this.hintQueue.shift();
  }

  /** A new species: a specimen card with the living organism inside. */
  private specimenToast(sp: SpeciesDef, dna: number) {
    const t = h('div', 'toast specimen');
    t.innerHTML = `<div class="sp-art"></div><div class="sp-txt"><div class="t-k">New species catalogued${dna ? ` · <b>+${dna} DNA</b>` : ''}</div><div class="t-t">${sp.name}</div><div class="t-l">${sp.latin} · No. ${specimenNo(sp)}</div></div>`;
    const pc = new PreviewCanvas(sp.look, 'sp-canvas', previewScale(sp.look) * 1.05);
    t.querySelector('.sp-art')!.appendChild(pc.canvas);
    this.toastPreviews.push(pc);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 2) this.toasts.firstElementChild?.remove();
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => { t.remove(); this.toastPreviews = this.toastPreviews.filter((x) => x !== pc); }, 3800);
  }

  toast(title: string, sub: string, kind: string, dna: number) {
    const compact = kind === 'species';
    const t = h('div', `toast ${kind} ${compact ? 'compact' : ''}`);
    const label = kind === 'species' ? 'New species' : kind === 'zone' ? 'Region discovered' : kind === 'milestone' ? 'Milestone' : kind === 'mutation' ? 'Mutation' : 'Discovery';
    t.innerHTML = compact
      ? `<span class="t-k">${label}</span><span class="t-t">${title}</span>${dna ? `<b class="t-d">+${dna}</b>` : ''}`
      : `<div class="t-k">${label}${dna ? ` · <b>+${dna} DNA</b>` : ''}</div><div class="t-t">${title}</div><div class="t-s">${sub}</div>`;
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 2) this.toasts.firstElementChild?.remove();
    const life = compact ? 2400 : 3600;
    setTimeout(() => t.classList.add('out'), life);
    setTimeout(() => t.remove(), life + 600);
  }

  handleEvent(e: GameEvent) {
    if (e.type === 'hint') this.hint(e.text);
    else if (e.type === 'discover') {
      const sp = e.speciesId ? SPECIES_BY_ID[e.speciesId] : undefined;
      if (sp) this.specimenToast(sp, e.dna); else this.toast(e.title, e.sub, e.kind, e.dna);
    }
    else if (e.type === 'leap') this.showEraCard(e.era);
    else if (e.type === 'mutation') {
      const t = TRAIT_BY_ID[e.traitId];
      this.toast(t.levels[e.level - 1].name, e.first ? 'New mutation discovered' : 'Mutation acquired', 'mutation', 0);
    }
  }

  // ───────────────────────── screens ─────────────────────────
  private open(name: string, el: HTMLElement) {
    this.screens.innerHTML = '';
    this.current = name;
    el.classList.add('screen', `s-${name}`);
    this.screens.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
  }
  closeScreen() {
    this.previews = [];
    this.screens.innerHTML = '';
    this.current = null;
  }

  /** animate menu previews */
  tick(t: number) {
    for (const p of this.previews) p.draw(t);
    for (const p of this.toastPreviews) p.draw(t, 0.4);
  }

  /** This life's evolutionary path: one node per era with the mutations chosen in it. */
  private lineageRibbon(p: Player): HTMLElement {
    const wrap = h('div', 'ribbon');
    const steps = lineageLooks(p);
    steps.forEach(({ h: st, form, look }, i) => {
      const node = h('div', `rb-node ${i === steps.length - 1 ? 'now' : ''}`);
      const art = h('div', 'rb-art');
      art.appendChild(staticPreview(look, 58, look.body === 'swimmer' ? 0.24 : 0.3));
      node.appendChild(art);
      const genes = st.traits.map((id) => `<span title="${TRAIT_BY_ID[id].name}">${TRAIT_BY_ID[id].icon}</span>`).join('');
      node.appendChild(h('div', 'rb-txt', `<div class="rb-era">Era ${ERAS[st.era - 1].numeral}</div><div class="rb-name">${form.name}</div><div class="rb-genes">${genes || '<i>—</i>'}</div>`));
      wrap.appendChild(node);
      if (i < steps.length - 1) wrap.appendChild(h('div', 'rb-link'));
    });
    return wrap;
  }

  showTitle() {
    this.previews = [];
    this.showHud(false);
    const d = this.game.progress.data;
    const saved = this.cb.savedRun();
    const savedForm = saved ? (FORM_BY_ID[saved.player.formId]?.name ?? 'Your lineage') : '';
    const el = h('div', 'title-screen');
    el.innerHTML = `
      <div class="title-wrap">
        <div class="logo-cell"></div>
        <h1 class="logo">PRIMORDIA</h1>
        <p class="tagline">Begin as a single cell. Become whatever survives.</p>
        ${saved ? `<div class="continue-card"><div class="cc-art"></div><div class="cc-body"><div class="ev-k">Saved life</div><div class="cc-name">${savedForm}</div><div class="cc-meta">Era ${ERAS[saved.player.eraIndex - 1].numeral} · ${fmtTime(saved.run.time)} alive · ${Object.values(saved.player.traits).reduce((a, b) => a + b, 0)} mutations</div></div></div>
        <button class="btn primary" id="t-continue">Continue</button>` : ''}
        <button class="btn ${saved ? 'ghost' : 'primary'}" id="t-start">${d.records.runs ? 'Begin a New Life' : 'Begin Life'}</button>
        <div class="row">
          <button class="btn ghost" id="t-codex">Codex</button>
          <button class="btn ghost" id="t-settings">Settings</button>
        </div>
        ${d.records.runs ? `<div class="title-stats"><span>Lives <b>${d.records.runs}</b></span><span>Best <b>${fmtTime(d.records.bestTime)}</b></span><span>Furthest <b>Era ${ERAS[d.maxEra - 1].numeral}</b></span></div>` : ''}
      </div>`;
    this.open('title', el);
    const pc = new PreviewCanvas(buildPlayerLook({}, 1, formFor(1, 'opportunist')), 'logo-canvas', 0.3);
    el.querySelector('.logo-cell')!.appendChild(pc.canvas);
    this.previews.push(pc);
    if (saved) {
      const f = FORM_BY_ID[saved.player.formId] ?? formFor(saved.player.eraIndex, 'opportunist');
      const cc = new PreviewCanvas(buildPlayerLook(saved.player.traits, saved.player.eraIndex, f), 'cc-canvas', 0.3);
      el.querySelector('.cc-art')!.appendChild(cc.canvas);
      this.previews.push(cc);
      el.querySelector('#t-continue')!.addEventListener('click', () => { this.audio.unlock(); this.audio.ui(); this.cb.onContinue(); });
    }
    let armed = false;
    el.querySelector('#t-start')!.addEventListener('click', (ev) => {
      this.audio.unlock(); this.audio.ui();
      if (saved && !armed) { armed = true; (ev.currentTarget as HTMLElement).textContent = 'Tap again — your saved life will end'; return; }
      this.cb.onStart();
    });
    el.querySelector('#t-codex')!.addEventListener('click', () => { this.audio.unlock(); this.audio.ui(); this.showCodex(() => this.showTitle()); });
    el.querySelector('#t-settings')!.addEventListener('click', () => { this.audio.unlock(); this.audio.ui(); this.showSettings(() => this.showTitle()); });
  }

  showSettings(back: () => void) {
    this.previews = [];
    const s = this.game.progress.data.settings;
    const el = h('div', 'panel-screen');
    el.innerHTML = `
      <div class="panel">
        <h2>Settings</h2>
        <div class="setting"><div><b>Sound</b><small>Ambience and feedback</small></div><button class="toggle ${s.sound ? 'on' : ''}" id="st-sound"><i></i></button></div>
        <div class="setting"><div><b>Music</b><small>A score that evolves with each era</small></div><button class="toggle ${s.music ? 'on' : ''}" id="st-music"><i></i></button></div>
        <div class="setting"><div><b>Controls</b><small>Joystick: drag on the left side. Follow: touch anywhere and the cell swims toward your finger.</small></div>
          <div class="seg" id="st-ctrl"><button data-v="joystick" class="${s.controls === 'joystick' ? 'on' : ''}">Joystick</button><button data-v="drag" class="${s.controls === 'drag' ? 'on' : ''}">Follow</button></div></div>
        <div class="setting"><div><b>Keyboard</b><small>WASD / arrows to swim · Space to burst · Q E R F T G abilities · V evolve · Esc pause</small></div></div>
        <div class="setting danger"><div><b>Erase discoveries</b><small>Clears the Codex and records</small></div><button class="btn small ghost" id="st-reset">Erase</button></div>
        <button class="btn primary" id="st-back">Done</button>
      </div>`;
    this.open('settings', el);
    el.querySelector('#st-sound')!.addEventListener('click', (ev) => {
      s.sound = !s.sound; (ev.currentTarget as HTMLElement).classList.toggle('on', s.sound);
      this.audio.setEnabled(s.sound); this.game.progress.flush();
    });
    el.querySelector('#st-music')!.addEventListener('click', (ev) => {
      s.music = !s.music; (ev.currentTarget as HTMLElement).classList.toggle('on', s.music);
      this.audio.setMusic(s.music); this.game.progress.flush();
    });
    el.querySelectorAll<HTMLButtonElement>('#st-ctrl button').forEach((b) => b.addEventListener('click', () => {
      s.controls = b.dataset.v as 'joystick' | 'drag';
      this.input.mode = s.controls;
      el.querySelectorAll('#st-ctrl button').forEach((x) => x.classList.toggle('on', x === b));
      this.game.progress.flush();
      this.audio.ui();
    }));
    let armed = false;
    el.querySelector('#st-reset')!.addEventListener('click', (ev) => {
      const b = ev.currentTarget as HTMLButtonElement;
      if (!armed) { armed = true; b.textContent = 'Tap again'; return; }
      this.game.progress.reset(); b.textContent = 'Erased'; b.disabled = true;
    });
    el.querySelector('#st-back')!.addEventListener('click', () => { this.audio.ui(); back(); });
  }

  showPause() {
    this.previews = [];
    const g = this.game, p = g.player;
    const el = h('div', 'panel-screen');
    const traits = p.traitOrder.map((id) => `<span class="chip">${TRAIT_BY_ID[id].icon} ${TRAIT_BY_ID[id].levels[p.traits[id] - 1].name}</span>`).join('') || '<span class="muted">No mutations yet</span>';
    el.innerHTML = `
      <div class="panel">
        <h2>Paused</h2>
        <div class="pause-org"></div>
        <div class="pause-name">${p.form.name} <span class="muted">· Era ${p.era.numeral} · ${ARCHETYPE_INFO[p.archetype].name}</span></div>
        <h3>This lineage</h3>
        <div class="pause-ribbon"></div>
        <div class="chips">${traits}</div>
        <div class="statline"><span>Alive <b>${fmtTime(g.run.time)}</b></span><span>Eaten <b>${g.run.eaten}</b></span><span>DNA <b>${g.run.dna}</b></span></div>
        <button class="btn primary" id="p-resume">Resume</button>
        <div class="row">
          <button class="btn ghost" id="p-codex">Codex</button>
          <button class="btn ghost" id="p-settings">Settings</button>
        </div>
        <button class="btn ghost" id="p-save">Save &amp; exit to title</button>
        <button class="btn ghost small" id="p-quit">Abandon this life</button>
      </div>`;
    this.open('pause', el);
    const pc = new PreviewCanvas(p.look, 'pause-canvas', 0.26);
    el.querySelector('.pause-org')!.appendChild(pc.canvas);
    this.previews.push(pc);
    el.querySelector('.pause-ribbon')!.appendChild(this.lineageRibbon(p));
    el.querySelector('#p-resume')!.addEventListener('click', () => { this.audio.ui(); this.togglePause(); });
    el.querySelector('#p-codex')!.addEventListener('click', () => { this.audio.ui(); this.showCodex(() => this.showPause()); });
    el.querySelector('#p-settings')!.addEventListener('click', () => { this.audio.ui(); this.showSettings(() => this.showPause()); });
    el.querySelector('#p-save')!.addEventListener('click', () => { this.audio.ui(); this.cb.onSaveAndExit(); });
    let armed = false;
    el.querySelector('#p-quit')!.addEventListener('click', (ev) => {
      const b = ev.currentTarget as HTMLButtonElement;
      if (!armed) { armed = true; b.textContent = 'Tap again to end this life'; return; }
      this.cb.onQuitToTitle();
    });
  }

  // ───────────────────────── evolution chamber ─────────────────────────
  showEvolve() {
    this.previews = [];
    const g = this.game, p = g.player;
    const el = h('div', 'evolve-screen');
    const first = p.mutationCount === 0;
    el.innerHTML = `
      <div class="evolve-head">
        <div class="ev-k">${first ? 'Your first mutation' : 'Evolution'}</div>
        <h2>Choose an adaptation</h2>
        <div class="ev-dna"><span class="helix-ic"></span><b>${p.dna}</b> DNA available</div>
      </div>
      <div class="offers scroll"></div>
      <div class="evolve-foot">
        <button class="btn ghost" id="ev-later">Not yet — keep collecting</button>
      </div>`;
    const wrap = el.querySelector('.offers')!;
    g.offers.forEach((o: Offer, i) => {
      const lv = o.trait.levels[o.level - 1];
      const afford = p.dna >= o.cost;
      const card = h('button', `offer ${afford ? '' : 'locked'} cat-${o.trait.category.toLowerCase()}`) as HTMLButtonElement;
      const traits = { ...p.traits, [o.trait.id]: o.level };
      const look = buildPlayerLook(traits, p.eraIndex, p.form);
      const discovered = (g.progress.data.mutations[o.trait.id] || 0) >= o.level;
      card.innerHTML = `
        <div class="o-art"></div>
        <div class="o-body">
          <div class="o-top"><span class="o-cat">${o.trait.category}</span>${o.level > 1 ? `<span class="o-lv">Level ${o.level}</span>` : ''}${!discovered ? '<span class="o-new">New</span>' : ''}</div>
          <div class="o-name">${o.trait.icon} ${lv.name}</div>
          <div class="o-bio">${o.trait.bio}</div>
          <ul class="o-pros">${lv.pros.map((x) => `<li>${x}</li>`).join('')}</ul>
          <ul class="o-cons">${lv.cons.map((x) => `<li>${x}</li>`).join('')}</ul>
          <div class="o-cost ${afford ? '' : 'short'}"><span class="helix-ic"></span>${o.cost} DNA${afford ? '' : ` · need ${o.cost - p.dna} more`}</div>
        </div>`;
      const pc = new PreviewCanvas(look, 'o-canvas', 0.27);
      card.querySelector('.o-art')!.appendChild(pc.canvas);
      this.previews.push(pc);
      card.addEventListener('click', () => {
        if (!afford) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); return; }
        if (g.chooseMutation(i)) this.closeScreen();
      });
      wrap.appendChild(card);
    });
    el.querySelector('#ev-later')!.addEventListener('click', () => { this.audio.ui(); g.closeEvolve(true); this.closeScreen(); });
    this.open('evolve', el);
  }

  showLeap() {
    this.previews = [];
    const g = this.game, p = g.player;
    const form = g.pendingLeapForm!;
    const next = ERAS[p.eraIndex];
    const el = h('div', 'leap-screen');
    const arch = ARCHETYPE_INFO[form.archetype ?? p.archetype];
    el.innerHTML = `
      <div class="leap-inner">
        <div class="ev-k">Evolutionary leap</div>
        <h2>Era ${next.numeral} · ${next.name}</h2>
        <p class="muted">${next.subtitle}</p>
        <div class="leap-art"><div class="leap-from"></div><div class="leap-arrow">→</div><div class="leap-to"></div></div>
        <div class="leap-form">${form.name}</div>
        <div class="leap-arch">Lineage: <b>${arch.name}</b> — ${arch.blurb}</div>
        <p class="leap-desc">${form.desc}</p>
        <p class="leap-note">${next.worldScale > p.era.worldScale ? 'Your body grows and the sea opens up around you. New life fills it — and new mutations become possible.' : 'Your body grows. New life fills the sea — and new mutations become possible.'}</p>
        <button class="btn primary" id="lp-go">Transform</button>
      </div>`;
    const from = new PreviewCanvas(p.look, 'leap-canvas small', 0.26);
    const toLook = buildPlayerLook(p.traits, p.eraIndex + 1, form);
    const to = new PreviewCanvas(toLook, 'leap-canvas', 0.3);
    el.querySelector('.leap-from')!.appendChild(from.canvas);
    el.querySelector('.leap-to')!.appendChild(to.canvas);
    this.previews.push(from, to);
    el.querySelector('#lp-go')!.addEventListener('click', () => { g.confirmLeap(); this.closeScreen(); });
    this.open('leap', el);
  }

  // ───────────────────────── death summary ─────────────────────────
  showDeath() {
    this.previews = [];
    const g = this.game, p = g.player, r = g.run;
    const best = g.finalizeRun();
    const el = h('div', 'panel-screen death');
    const traits = p.traitOrder.map((id) => `<span class="chip">${TRAIT_BY_ID[id].icon} ${TRAIT_BY_ID[id].levels[p.traits[id] - 1].name}</span>`).join('') || '<span class="muted">None — evolution was waiting</span>';
    const disc = r.discoveries.length ? r.discoveries.map((d) => `<span class="chip gold">${d}</span>`).join('') : '<span class="muted">Nothing new this time</span>';
    const ms = r.milestones.filter((m) => MILESTONES[m]).map((m) => `<span class="chip">${MILESTONES[m].name}</span>`).join('') || '<span class="muted">—</span>';
    el.innerHTML = `
      <div class="panel wide scroll">
        <div class="ev-k">Life ended</div>
        <h2>${r.causeDetail}</h2>
        <div class="death-org"></div>
        <div class="pause-name">${p.form.name} <span class="muted">· Era ${p.era.numeral} · ${ARCHETYPE_INFO[p.archetype].name}</span></div>
        <div class="stat-grid">
          <div><small>Survived</small><b>${fmtTime(r.time)}</b>${best.time ? '<em>New best</em>' : ''}</div>
          <div><small>Organisms eaten</small><b>${r.eaten}</b>${best.eaten ? '<em>New best</em>' : ''}</div>
          <div><small>DNA gathered</small><b>${r.dna}</b>${best.dna ? '<em>New best</em>' : ''}</div>
          <div><small>Regions</small><b>${r.zones.size}/5</b></div>
        </div>
        <h3>Your lineage</h3><div class="death-ribbon"></div>
        <h3>Mutations</h3><div class="chips">${traits}</div>
        <h3>New discoveries</h3><div class="chips">${disc}</div>
        <h3>Milestones</h3><div class="chips">${ms}</div>
        <p class="muted tip">${this.deathTip(r.cause)}</p>
        <button class="btn primary" id="d-again">Evolve Again</button>
        <div class="row">
          <button class="btn ghost" id="d-codex">Codex</button>
          <button class="btn ghost" id="d-title">Title</button>
        </div>
      </div>`;
    this.open('death', el);
    const pc = new PreviewCanvas(p.look, 'pause-canvas', 0.26);
    el.querySelector('.death-org')!.appendChild(pc.canvas);
    this.previews.push(pc);
    el.querySelector('.death-ribbon')!.appendChild(this.lineageRibbon(p));
    el.querySelector('#d-again')!.addEventListener('click', () => { this.audio.ui(); this.cb.onRestart(); });
    el.querySelector('#d-codex')!.addEventListener('click', () => { this.audio.ui(); this.showCodex(() => this.showDeathAgain()); });
    el.querySelector('#d-title')!.addEventListener('click', () => { this.audio.ui(); this.cb.onQuitToTitle(); });
    this.deathEl = el;
  }
  private deathEl: HTMLElement | null = null;
  private showDeathAgain() {
    if (!this.deathEl) return this.showTitle();
    const el = this.deathEl;
    this.closeScreen();
    this.current = 'death';
    this.screens.appendChild(el);
    const pc = new PreviewCanvas(this.game.player.look, 'pause-canvas', 0.26);
    const holder = el.querySelector('.death-org')!;
    holder.innerHTML = '';
    holder.appendChild(pc.canvas);
    this.previews.push(pc);
  }

  private deathTip(cause: string) {
    switch (cause) {
      case 'predator': return 'Tip: red-haloed cells are hunting you. A flash of brighter glow means they are about to strike — Burst sideways. Membranes, spines and toxins all change how predators treat you.';
      case 'starved': return 'Tip: every movement burns energy. Nutrient-rich regions like the Thermal Vents and Biofilm Thicket feed you faster — and Photosynthesis lets light feed you.';
      case 'heat': return 'Tip: vent cores are scalding. A Protective Membrane or Contractile Vacuole lets you feast on vent nutrients safely.';
      case 'spines': return 'Tip: spiny cells hurt to touch unless you have a Protective Membrane — or Pseudopods to engulf them whole.';
      case 'toxin': return 'Tip: toxic prey hurts to eat. Pellicle Plates make you immune.';
      case 'suffocated': return 'Tip: dry land is safe from sea hunters, but you can only hold your breath so long. Lungs and Keratin Skin let you stay ashore.';
      default: return '';
    }
  }

  // ───────────────────────── codex: a field journal ─────────────────────────
  showCodex(back: () => void, tab = 'species') {
    this.previews = [];
    const el = h('div', 'panel-screen codex');
    const tabs: [string, string][] = [['species', 'Specimens'], ['lineage', 'Tree of Life'], ['mutations', 'Mutations'], ['eras', 'Eras'], ['records', 'Records']];
    el.innerHTML = `
      <div class="panel codex-panel journal">
        <div class="codex-head">
          <div><div class="ev-k">Field Journal</div><h2>Codex of the Primordial Sea</h2></div>
          <button class="btn small ghost" id="cx-back">Close</button>
        </div>
        <div class="tabs">${tabs.map(([t, n]) => `<button data-t="${t}" class="${t === tab ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="codex-body scroll"></div>
      </div>`;
    const body = el.querySelector('.codex-body') as HTMLElement;
    const render = (t: string) => {
      this.previews = [];
      body.innerHTML = '';
      body.scrollTop = 0;
      if (t === 'species') this.renderSpecimens(body);
      else if (t === 'lineage') this.renderTree(body);
      else if (t === 'mutations') this.renderMutations(body);
      else if (t === 'eras') this.renderEras(body);
      else this.renderRecords(body);
    };
    el.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => b.addEventListener('click', () => {
      el.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
      this.audio.ui();
      render(b.dataset.t!);
    }));
    el.querySelector('#cx-back')!.addEventListener('click', () => { this.audio.ui(); back(); });
    this.open('codex', el);
    render(tab);
  }

  private renderSpecimens(body: HTMLElement) {
    const d = this.game.progress.data;
    const seen = SPECIES.filter((s) => d.species[s.id]).length;
    const frac = seen / SPECIES.length;
    const C = 2 * Math.PI * 26;
    const head = h('div', 'cx-summary');
    head.innerHTML = `
      <svg viewBox="0 0 64 64" class="cx-ring"><circle cx="32" cy="32" r="26" class="bgc"/><circle cx="32" cy="32" r="26" class="fgc" stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}"/></svg>
      <div><div class="cx-count"><b>${seen}</b> of ${SPECIES.length} species catalogued</div>
      <div class="cx-eras">${ERAS.map((e) => {
        const all = SPECIES.filter((s) => s.eras[0] === e.index);
        const got = all.filter((s) => d.species[s.id]).length;
        return `<span class="${got === all.length && all.length ? 'done' : ''}"><em>${e.numeral}</em><i style="--f:${all.length ? got / all.length : 0}"></i></span>`;
      }).join('')}</div></div>`;
    body.appendChild(head);
    for (const e of ERAS) {
      const list = SPECIES.filter((s) => s.eras[0] === e.index);
      if (!list.length) continue;
      const got = list.filter((s) => d.species[s.id]).length;
      body.appendChild(h('div', 'cx-era', `<span>Era ${e.numeral} · ${e.name}</span><b>${got}/${list.length}</b>`));
      const grid = h('div', 'plates');
      for (const sp of list) {
        const known = !!d.species[sp.id];
        const tile = h('button', `plate ${known ? '' : 'unknown'} cat-${sp.category}`) as HTMLButtonElement;
        tile.appendChild(staticPreview(sp.look, 84, previewScale(sp.look), 'preview', !known));
        tile.appendChild(h('div', 'pl-no', `No. ${specimenNo(sp)}`));
        tile.appendChild(h('div', 'pl-name', known ? sp.name : 'Unidentified'));
        tile.addEventListener('click', () => {
          if (known) { this.audio.ui(); this.renderSpecimen(body, sp); return; }
          tile.classList.remove('shake'); void tile.offsetWidth; tile.classList.add('shake');
          const zones = habitat(sp).slice(0, 1).map((z) => z.name).join('');
          this.hint(`Not yet observed — look in ${zones || 'the sea'} during Era ${ERAS[sp.eras[0] - 1].numeral}${sp.category === 'rare' ? ' (rare)' : ''}`);
          tile.querySelector('.pl-name')!.textContent = zones ? `Seen in ${zones}?` : 'Unidentified';
        });
        grid.appendChild(tile);
      }
      body.appendChild(grid);
    }
  }

  /** A full journal entry for one species. */
  private renderSpecimen(body: HTMLElement, sp: SpeciesDef) {
    this.previews = [];
    const d = this.game.progress.data;
    const e = d.species[sp.id];
    const clade = cladeOf(sp);
    const rel = relations(sp);
    const known = (s: SpeciesDef) => !!d.species[s.id];
    const date = e?.seen ? new Date(e.seen).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    body.innerHTML = '';
    body.scrollTop = 0;
    const el = h('div', 'specimen');
    el.innerHTML = `
      <button class="sp-back">‹ All specimens</button>
      <div class="slide">
        <div class="slide-art"></div>
        <div class="slide-meta"><span>No. ${specimenNo(sp)}</span><span>${clade.path.join(' › ')}</span></div>
      </div>
      <div class="sp-title">
        <h3 class="sp-name">${sp.name}</h3>
        <div class="sp-latin">${sp.latin}</div>
        <div class="sp-tags"><span class="tag cat-${sp.category}">${CATEGORY_LABEL[sp.category]}</span><span class="tag">Era ${sp.eras.map((x) => ERAS[x - 1].numeral).join('–')}</span><span class="tag">${clade.name}</span></div>
      </div>
      <p class="sp-desc">${sp.desc}</p>
      <h4>Characteristics</h4>
      <div class="chips left">${characteristics(sp).map((c) => `<span class="chip">${c}</span>`).join('')}</div>
      <h4>Behaviour</h4>
      <ul class="notes">${behaviour(sp).map((b) => `<li>${b}</li>`).join('')}</ul>
      <h4>Habitat</h4>
      <div class="habitat">${habitat(sp).map((z) => `<div class="hb"><span>${d.zones[z.zone] ? z.name : 'Unexplored region'}</span><i style="--f:${z.w.toFixed(2)}"></i></div>`).join('')}</div>
      <h4>Evolutionary relationships</h4>
      <p class="muted small">${clade.name}: ${clade.blurb}</p>
      <div class="rel"></div>
      <h4>Observation record</h4>
      <div class="stat-grid three">
        <div><small>First observed</small><b class="sm">${date}</b></div>
        <div><small>Consumed</small><b>${e?.eaten ?? 0}</b></div>
        <div><small>Killed you</small><b>${e?.killedBy ?? 0}</b></div>
      </div>`;
    const pc = new PreviewCanvas(sp.look, 'slide-canvas', previewScale(sp.look) * 1.1);
    el.querySelector('.slide-art')!.appendChild(pc.canvas);
    this.previews.push(pc);
    const relEl = el.querySelector('.rel')!;
    const group = (label: string, list: SpeciesDef[]) => {
      if (!list.length) return;
      const g = h('div', 'rel-group', `<div class="rel-k">${label}</div>`);
      const row = h('div', 'rel-row');
      for (const s of list) {
        const k = known(s);
        const b = h('button', `rel-sp ${k ? '' : 'unknown'}`) as HTMLButtonElement;
        b.appendChild(staticPreview(s.look, 46, previewScale(s.look), 'preview', !k));
        b.appendChild(h('span', '', k ? s.name : '?'));
        if (k) b.addEventListener('click', () => { this.audio.ui(); this.renderSpecimen(body, s); });
        row.appendChild(b);
      }
      g.appendChild(row);
      relEl.appendChild(g);
    };
    group('Closest relatives', rel.relatives);
    group('Preys upon', rel.preysOn);
    group('Hunted by', rel.huntedBy);
    if (!relEl.children.length) relEl.appendChild(h('p', 'muted small', 'No known relatives — a lineage of one.'));
    el.querySelector('.sp-back')!.addEventListener('click', () => { this.audio.ui(); this.previews = []; body.innerHTML = ''; this.renderSpecimens(body); });
    body.appendChild(el);
  }

  /** The Tree of Life: every form a lineage can take, era by era. */
  private renderTree(body: HTMLElement) {
    const d = this.game.progress.data;
    const discovered = FORMS.filter((f) => d.forms[f.id]).length;
    body.appendChild(h('p', 'muted small', `Every life begins as a Protocell. The mutations you favour decide which branch it grows along at each leap. <b>${discovered}</b> of ${FORMS.length} forms discovered.`));
    const W = Math.max(300, Math.min(520, body.clientWidth || 340));
    const left = 26, colW = (W - left) / 4, rowH = 112, node = 54, top = 60;
    const maxEra = ERAS.length;
    const H = top + (maxEra - 1) * rowH + node + 34;
    const tree = h('div', 'tree');
    tree.style.width = W + 'px';
    tree.style.height = H + 'px';
    const pos = (f: FormDef): [number, number] => {
      if (!f.archetype) return [left + (W - left) / 2, top];
      return [left + colW * (ARCH_ORDER.indexOf(f.archetype) + 0.5), top + (f.era - 1) * rowH];
    };
    const path = d.lastLineage || [];
    const onPath = (a: FormDef, b: FormDef) => { const i = path.indexOf(a.id); return i >= 0 && path[i + 1] === b.id; };
    let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
    // archetype columns
    ARCH_ORDER.forEach((a, i) => { svg += `<text x="${left + colW * (i + 0.5)}" y="14" class="col">${ARCH_SHORT[a]}</text>`; });
    for (let e = 1; e <= maxEra; e++) svg += `<text x="4" y="${top + (e - 1) * rowH + 4}" class="eran">${ERAS[e - 1].numeral}</text>`;
    const links: string[] = [], gold: string[] = [];
    for (const f of FORMS) {
      if (f.era <= 1) continue;
      const prev = FORMS.filter((p) => p.era === f.era - 1);
      for (const p of prev) {
        const [x1, y1] = pos(p), [x2, y2] = pos(f);
        const main = !p.archetype || p.archetype === f.archetype;
        const reached = !!d.forms[p.id] && !!d.forms[f.id];
        const dpath = `M${x1},${y1 + node / 2} C${x1},${(y1 + y2) / 2 + 8} ${x2},${(y1 + y2) / 2 - 8} ${x2},${y2 - node / 2}`;
        if (onPath(p, f)) gold.push(`<path d="${dpath}" class="ln gold"/>`);
        else if (main || reached) links.push(`<path d="${dpath}" class="ln ${main ? 'main' : 'cross'} ${reached ? 'lit' : ''}"/>`);
      }
    }
    svg += links.join('') + gold.join('') + '</svg>';
    tree.innerHTML = svg;
    const info = h('div', 'tree-info', '<span class="muted small">Tap a form to read about it.</span>');
    for (const f of FORMS) {
      const n = d.forms[f.id] || 0;
      const [x, y] = pos(f);
      const b = h('button', `tnode ${n ? '' : 'unknown'} ${path.includes(f.id) ? 'path' : ''}`) as HTMLButtonElement;
      b.style.left = x - node / 2 + 'px';
      b.style.top = y - node / 2 + 'px';
      const traits: Record<string, number> = {};
      const sample: Record<string, string[]> = { predator: ['flagellum', 'pseudopods'], defender: ['membrane'], opportunist: ['cilia'], phototroph: ['photosynthesis'] };
      if (f.archetype) for (const id of sample[f.archetype]) traits[id] = 1;
      const look = buildPlayerLook(traits, f.era, f);
      b.appendChild(staticPreview(look, node, look.body === 'swimmer' ? 0.22 : 0.3, 'preview', !n));
      b.appendChild(h('span', 'tn-name', n ? f.name : '?'));
      b.addEventListener('click', () => {
        this.audio.ui();
        tree.querySelectorAll('.tnode').forEach((x) => x.classList.toggle('sel', x === b));
        info.innerHTML = n
          ? `<div class="ti-k">Era ${ERAS[f.era - 1].numeral}${f.archetype ? ' · ' + ARCHETYPE_INFO[f.archetype].name : ' · The common ancestor'}</div><div class="ti-t">${f.name}</div><p>${f.desc}</p><div class="muted small">Reached ${n}×${path.includes(f.id) ? ' · on your most recent lineage' : ''}</div>`
          : `<div class="ti-k">Era ${ERAS[f.era - 1].numeral}${f.archetype ? ' · ' + ARCHETYPE_INFO[f.archetype].name : ''}</div><div class="ti-t">Undiscovered form</div><p class="muted">Lead a lineage into Era ${ERAS[f.era - 1].numeral} favouring ${f.archetype ? ARCHETYPE_INFO[f.archetype].name.toLowerCase() + ' mutations' : 'any path'} to reveal it.</p>`;
      });
      tree.appendChild(b);
    }
    const scroller = h('div', 'tree-wrap');
    scroller.appendChild(tree);
    body.appendChild(scroller);
    if (path.length) body.appendChild(h('div', 'tree-legend', '<i></i> Your most recent lineage'));
    body.appendChild(info);
  }

  private renderMutations(body: HTMLElement) {
    const d = this.game.progress.data;
    const grid = h('div', 'list');
    for (const tr of TRAITS) {
      const lv = d.mutations[tr.id] || 0;
      const row = h('div', `row-item ${lv ? '' : 'unknown'}`);
      row.innerHTML = lv
        ? `<div class="ri-ic">${tr.icon}</div><div><div class="c-name">${tr.name} <span class="muted">· ${tr.category} · Era ${ERAS[tr.era - 1].numeral}</span></div><div class="c-desc">${tr.bio}</div><div class="levels">${tr.levels.map((l, i) => `<span class="chip ${i < lv ? '' : 'dim'}">${l.name}</span>`).join('')}</div></div>`
        : `<div class="ri-ic">?</div><div><div class="c-name">Undiscovered mutation</div><div class="c-desc">${tr.category} · becomes possible in Era ${ERAS[tr.era - 1].numeral}${tr.requires ? ` · requires ${tr.requires.map((r) => TRAIT_BY_ID[r].name).join(', ')}` : ''}</div></div>`;
      grid.appendChild(row);
    }
    body.appendChild(grid);
  }

  private renderEras(body: HTMLElement) {
    const d = this.game.progress.data;
    const list = h('div', 'timeline');
    for (const e of ERAS) {
      const reached = d.maxEra >= e.index;
      const item = h('div', `tl ${reached ? 'reached' : ''} ${e.playable ? '' : 'future'}`);
      const scale = fmtLength(+(e.minR * 2 * (UM_PER_UNIT[e.index - 1] ?? 1)).toPrecision(2));
      item.innerHTML = `<div class="tl-n">${e.numeral}</div><div><div class="c-name">${e.name}</div><div class="c-desc">${e.subtitle}</div><div class="c-tag">${reached ? 'Reached' : e.playable ? 'Not yet reached' : 'Uncharted'} · bodies ~${scale}</div></div>`;
      list.appendChild(item);
    }
    body.appendChild(list);
    const zl = h('div', 'list');
    zl.appendChild(h('h4', '', 'Regions of the Primordial Sea'));
    for (const z of Object.keys(ZONES) as ZoneId[]) {
      const known = d.zones[z];
      zl.appendChild(h('div', `row-item ${known ? '' : 'unknown'}`, `<div class="ri-ic">${known ? '◈' : '?'}</div><div><div class="c-name">${known ? ZONES[z].name : 'Unexplored region'}</div><div class="c-desc">${known ? ZONES[z].blurb : 'Somewhere out in the sea…'}</div></div>`));
    }
    body.appendChild(zl);
  }

  private renderRecords(body: HTMLElement) {
    const d = this.game.progress.data, r = d.records;
    const deaths = Object.entries(r.deaths).map(([k, v]) => `<span class="chip">${({ predator: 'Eaten', starved: 'Starved', heat: 'Boiled', spines: 'Shredded', toxin: 'Poisoned', suffocated: 'Suffocated' } as Record<string, string>)[k] || k} ×${v}</span>`).join('') || '<span class="muted">—</span>';
    body.innerHTML = `
      <div class="stat-grid">
        <div><small>Lives lived</small><b>${r.runs}</b></div>
        <div><small>Longest life</small><b>${fmtTime(r.bestTime)}</b></div>
        <div><small>Most DNA</small><b>${r.bestDna}</b></div>
        <div><small>Most eaten</small><b>${r.mostEaten}</b></div>
        <div><small>Total eaten</small><b>${r.totalEaten}</b></div>
        <div><small>Furthest era</small><b>${ERAS[d.maxEra - 1].numeral}</b></div>
      </div>
      <h4>Fates</h4><div class="chips left">${deaths}</div>
      <h4>Milestones</h4>
      <div class="list">${Object.entries(MILESTONES).map(([id, m]) => `<div class="row-item ${d.milestones[id] ? '' : 'unknown'}"><div class="ri-ic">${d.milestones[id] ? '★' : '☆'}</div><div><div class="c-name">${m.name}</div><div class="c-desc">${m.desc}</div></div></div>`).join('')}</div>`;
  }
}
