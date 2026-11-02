import type { AbilityId } from '../game/traits';
import type { InputState } from '../game/game';

/**
 * Touch-first input: a floating virtual joystick on the left of the screen
 * (or drag-toward-finger mode), plus keyboard / mouse for desktop.
 */
export class Input {
  mode: 'joystick' | 'drag' = 'joystick';
  private keys = new Set<string>();
  private joyId: number | null = null;
  private joyOX = 0; private joyOY = 0;
  private joyX = 0; private joyY = 0;
  private dragActive = false;
  private dragX = 0; private dragY = 0;
  private mouseDown = false;
  private burstQueued = false;
  private abilityQueued: Partial<Record<AbilityId, boolean>> = {};
  /** player position on screen (CSS px) for drag-to-move */
  playerScreen = { x: 0, y: 0, r: 20 };
  enabled = false;
  readonly radius = 58;
  onPause: (() => void) | null = null;
  onEvolveKey: (() => void) | null = null;

  constructor(surface: HTMLElement, private joyBase: HTMLElement, private joyKnob: HTMLElement) {
    const opts = { passive: false } as AddEventListenerOptions;
    surface.addEventListener('touchstart', (e) => this.touchStart(e), opts);
    surface.addEventListener('touchmove', (e) => this.touchMove(e), opts);
    surface.addEventListener('touchend', (e) => this.touchEnd(e), opts);
    surface.addEventListener('touchcancel', (e) => this.touchEnd(e), opts);
    surface.addEventListener('mousedown', (e) => { if (!this.enabled) return; this.mouseDown = true; this.dragX = e.clientX; this.dragY = e.clientY; });
    window.addEventListener('mousemove', (e) => { this.dragX = e.clientX; this.dragY = e.clientY; });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(k);
      if (k === ' ' || k === 'shift') this.burstQueued = true;
      if (k === 'q' || k === '1') this.queueSlot(0);
      if (k === 'e' || k === '2') this.queueSlot(1);
      if (k === 'r' || k === '3') this.queueSlot(2);
      if (k === 'f' || k === '4') this.queueSlot(3);
      if (k === 't' || k === '5') this.queueSlot(4);
      if (k === 'g' || k === '6') this.queueSlot(5);
      if (k === 'escape' || k === 'p') this.onPause?.();
      if (k === 'v' || k === 'enter') this.onEvolveKey?.();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; this.releaseJoy(); });
    // stop iOS rubber-banding / pinch zoom
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || (e.target as HTMLElement)?.closest?.('.scroll') == null) e.preventDefault(); }, { passive: false });
  }

  slots: AbilityId[] = [];
  private queueSlot(i: number) { const id = this.slots[i]; if (id) this.abilityQueued[id] = true; }

  pressBurst() { this.burstQueued = true; }
  pressAbility(id: AbilityId) { this.abilityQueued[id] = true; }

  private touchStart(e: TouchEvent) {
    if (!this.enabled) return;
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (this.mode === 'drag') {
        if (this.joyId === null) { this.joyId = t.identifier; this.dragActive = true; this.dragX = t.clientX; this.dragY = t.clientY; }
        continue;
      }
      // joystick lives on the left ~60% of the screen
      if (this.joyId === null && t.clientX < window.innerWidth * 0.62) {
        this.joyId = t.identifier;
        this.joyOX = t.clientX; this.joyOY = t.clientY;
        this.joyX = 0; this.joyY = 0;
        this.showJoy();
      }
    }
  }
  private touchMove(e: TouchEvent) {
    if (!this.enabled) return;
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== this.joyId) continue;
      if (this.mode === 'drag') { this.dragX = t.clientX; this.dragY = t.clientY; continue; }
      let dx = t.clientX - this.joyOX, dy = t.clientY - this.joyOY;
      const d = Math.hypot(dx, dy);
      const R = this.radius;
      if (d > R) {
        // floating base follows the thumb so you never run out of stick
        const over = d - R;
        this.joyOX += (dx / d) * over; this.joyOY += (dy / d) * over;
        dx = t.clientX - this.joyOX; dy = t.clientY - this.joyOY;
      }
      this.joyX = dx / R; this.joyY = dy / R;
      this.showJoy();
    }
  }
  private touchEnd(e: TouchEvent) {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.joyId) this.releaseJoy();
    }
  }
  private releaseJoy() {
    this.joyId = null; this.joyX = 0; this.joyY = 0; this.dragActive = false;
    this.joyBase.style.opacity = '0';
  }
  private showJoy() {
    const b = this.joyBase.style, k = this.joyKnob.style;
    b.opacity = '1';
    b.transform = `translate(${this.joyOX - this.radius}px, ${this.joyOY - this.radius}px)`;
    k.transform = `translate(${this.joyX * this.radius}px, ${this.joyY * this.radius}px)`;
  }

  reset() { this.releaseJoy(); this.keys.clear(); this.burstQueued = false; this.abilityQueued = {}; this.mouseDown = false; }

  read(out: InputState): InputState {
    let mx = 0, my = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) my -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) my += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) mx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1;
    if (mx || my) { const l = Math.hypot(mx, my); mx /= l; my /= l; }
    if (this.joyId !== null && this.mode === 'joystick') {
      const d = Math.hypot(this.joyX, this.joyY);
      // dead zone + response curve for fine control
      if (d > 0.12) {
        const k = Math.min(1, (d - 0.12) / 0.78);
        mx = (this.joyX / d) * k; my = (this.joyY / d) * k;
      }
    } else if (this.dragActive || this.mouseDown) {
      const dx = this.dragX - this.playerScreen.x, dy = this.dragY - this.playerScreen.y;
      const d = Math.hypot(dx, dy);
      if (d > this.playerScreen.r * 0.6) {
        const k = Math.min(1, (d - this.playerScreen.r * 0.6) / 110);
        mx = (dx / d) * k; my = (dy / d) * k;
      }
    }
    out.mx = mx; out.my = my;
    out.burst = this.burstQueued;
    out.abilities = this.abilityQueued;
    this.burstQueued = false;
    this.abilityQueued = {};
    return out;
  }
}
