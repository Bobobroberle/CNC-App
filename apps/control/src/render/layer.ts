import type { Viewport } from './draw';

/** How far a cached layer may be shifted or scaled before it is redrawn. */
const MAX_SHIFT = 1 / 3;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

/**
 * Bitmap cache for the job layer. While the operator pans or zooms the cached
 * image is only moved and scaled (cheap); it is redrawn sharp when the view
 * rests, when its content changes or when it would leave too much empty space.
 */
export class LayerCache {
  private canvas: HTMLCanvasElement | null = null;
  private vp: Viewport | null = null;
  private key = '';

  /** Forget the bitmap, e.g. when colours change. */
  invalidate(): void {
    this.key = '';
  }

  /**
   * Draws the layer for `vp` onto `ctx`. `allowStale` permits reusing a
   * bitmap rendered for another viewport. Returns true if it re-rendered.
   */
  paint(
    ctx: CanvasRenderingContext2D,
    vp: Viewport,
    key: string,
    allowStale: boolean,
    render: (layer: CanvasRenderingContext2D, vp: Viewport) => void,
  ): boolean {
    const width = Math.round(vp.width * vp.dpr);
    const height = Math.round(vp.height * vp.dpr);
    // A stage without room (a window being resized, a sheet lying over it): nothing to draw.
    if (width === 0 || height === 0) return false;
    let reuse =
      this.canvas !== null &&
      this.vp !== null &&
      key === this.key &&
      this.canvas.width === width &&
      this.canvas.height === height;
    if (reuse && !sameView(vp, this.vp!)) {
      const k = vp.scale / this.vp!.scale;
      const dx = vp.originX - this.vp!.originX * k;
      const dy = vp.originY - this.vp!.originY * k;
      reuse =
        allowStale &&
        k >= MIN_SCALE &&
        k <= MAX_SCALE &&
        Math.abs(dx) < vp.width * MAX_SHIFT &&
        Math.abs(dy) < vp.height * MAX_SHIFT;
    }
    const rendered = !reuse;
    if (rendered) {
      this.canvas ??= document.createElement('canvas');
      this.canvas.width = width;
      this.canvas.height = height;
      const layer = this.canvas.getContext('2d')!;
      layer.clearRect(0, 0, width, height);
      render(layer, vp);
      this.vp = vp;
      this.key = key;
    }
    const k = vp.scale / this.vp!.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(
      this.canvas!,
      vp.dpr * (vp.originX - this.vp!.originX * k),
      vp.dpr * (vp.originY - this.vp!.originY * k),
      width * k,
      height * k,
    );
    return rendered;
  }
}

function sameView(a: Viewport, b: Viewport): boolean {
  return a.scale === b.scale && a.originX === b.originX && a.originY === b.originY;
}
