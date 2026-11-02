/** Uniform grid spatial hash over a bounded world. Rebuilt each tick. */
export interface Positioned { x: number; y: number; r: number }

export class SpatialGrid<T extends Positioned> {
  private cells: T[][];
  readonly cols: number;
  readonly rows: number;
  constructor(readonly width: number, readonly height: number, readonly cellSize: number) {
    this.cols = Math.ceil(width / cellSize) + 1;
    this.rows = Math.ceil(height / cellSize) + 1;
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }
  clear() {
    for (const c of this.cells) c.length = 0;
  }
  private idx(x: number, y: number) {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellSize)));
    return cy * this.cols + cx;
  }
  insert(item: T) {
    this.cells[this.idx(item.x, item.y)].push(item);
  }
  /** Items whose centre lies within (radius + their own r + pad) of point. */
  query(x: number, y: number, radius: number, out: T[], pad = 0): T[] {
    out.length = 0;
    const reach = radius + pad;
    const x0 = Math.max(0, Math.floor((x - reach) / this.cellSize));
    const x1 = Math.min(this.cols - 1, Math.floor((x + reach) / this.cellSize));
    const y0 = Math.max(0, Math.floor((y - reach) / this.cellSize));
    const y1 = Math.min(this.rows - 1, Math.floor((y + reach) / this.cellSize));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = this.cells[cy * this.cols + cx];
        for (let i = 0; i < cell.length; i++) {
          const it = cell[i];
          const dx = it.x - x, dy = it.y - y;
          const rr = radius + it.r;
          if (dx * dx + dy * dy <= rr * rr) out.push(it);
        }
      }
    }
    return out;
  }
}
