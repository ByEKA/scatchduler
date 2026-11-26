export interface Draw2D {
  readonly width: number;
  readonly height: number;
  save(): void;
  restore(): void;
  setAlpha?(alpha: number): void;
  clipRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number, color: string): void;
  strokeRect(x: number, y: number, w: number, h: number, color: string, lineWidth?: number): void;
  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    options?: { width?: number; dash?: number[] },
  ): void;
  polyline(
    points: ReadonlyArray<readonly [number, number]>,
    color: string,
    options?: { width?: number; dash?: number[] },
  ): void;
  fillPolygon(points: ReadonlyArray<readonly [number, number]>, color: string): void;
  text(
    x: number,
    y: number,
    value: string,
    options: {
      color: string;
      font: string;
      align?: 'left' | 'center' | 'right';
      baseline?: 'top' | 'middle' | 'bottom';
    },
  ): void;
  measureText(value: string, font: string): number;
}

function crisp(coord: number, lineWidth: number): number {
  return lineWidth % 2 === 1 ? Math.floor(coord) + 0.5 : coord;
}

/**
 * Browser Canvas 2D implementation of {@link Draw2D} (spec §7.2, D4). Applies HiDPI pixelRatio
 * scaling once in the constructor and snaps 1 px horizontal/vertical strokes to half-pixel centers.
 */
export class CanvasDraw2D implements Draw2D {
  readonly width: number;
  readonly height: number;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    pixelRatio: number,
  ) {
    this.ctx = context;
    this.width = width;
    this.height = height;
    const ratio = pixelRatio > 0 ? pixelRatio : 1;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  save(): void {
    this.ctx.save();
  }

  restore(): void {
    this.ctx.restore();
  }

  setAlpha(alpha: number): void {
    this.ctx.globalAlpha = alpha;
  }

  clipRect(x: number, y: number, w: number, h: number): void {
    this.ctx.beginPath();
    this.ctx.rect(x, y, w, h);
    this.ctx.clip();
  }

  fillRect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  strokeRect(x: number, y: number, w: number, h: number, color: string, lineWidth = 1): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.setLineDash([]);
    this.ctx.strokeRect(crisp(x, lineWidth), crisp(y, lineWidth), w, h);
  }

  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    options?: { width?: number; dash?: number[] },
  ): void {
    const width = options?.width ?? 1;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.setLineDash(options?.dash ?? []);
    this.ctx.beginPath();
    const isVert = x1 === x2;
    const isHoriz = y1 === y2;
    this.ctx.moveTo(isVert ? crisp(x1, width) : x1, isHoriz ? crisp(y1, width) : y1);
    this.ctx.lineTo(isVert ? crisp(x2, width) : x2, isHoriz ? crisp(y2, width) : y2);
    this.ctx.stroke();
  }

  polyline(
    points: ReadonlyArray<readonly [number, number]>,
    color: string,
    options?: { width?: number; dash?: number[] },
  ): void {
    if (points.length < 2) return;
    const width = options?.width ?? 1;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.setLineDash(options?.dash ?? []);
    this.ctx.beginPath();
    this.ctx.moveTo(points[0]![0], points[0]![1]);
    for (let i = 1; i < points.length; i++) {
      this.ctx.lineTo(points[i]![0], points[i]![1]);
    }
    this.ctx.stroke();
  }

  fillPolygon(points: ReadonlyArray<readonly [number, number]>, color: string): void {
    if (points.length < 3) return;
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0]![0], points[0]![1]);
    for (let i = 1; i < points.length; i++) {
      this.ctx.lineTo(points[i]![0], points[i]![1]);
    }
    this.ctx.closePath();
    this.ctx.fill();
  }

  text(
    x: number,
    y: number,
    value: string,
    options: {
      color: string;
      font: string;
      align?: 'left' | 'center' | 'right';
      baseline?: 'top' | 'middle' | 'bottom';
    },
  ): void {
    this.ctx.fillStyle = options.color;
    this.ctx.font = options.font;
    this.ctx.textAlign = options.align ?? 'left';
    this.ctx.textBaseline = options.baseline ?? 'middle';
    this.ctx.fillText(value, x, y);
  }

  measureText(value: string, font: string): number {
    this.ctx.font = font;
    return this.ctx.measureText(value).width;
  }
}

/** Deterministic headless recording spy used in Node tests and vector-export checks (S12). */
export function createRecordingDraw2D(
  width: number,
  height: number,
): Draw2D & { calls: Array<{ op: string; args: unknown[] }> } {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  return {
    width,
    height,
    calls,
    save() {
      calls.push({ op: 'save', args: [] });
    },
    restore() {
      calls.push({ op: 'restore', args: [] });
    },
    setAlpha(alpha) {
      calls.push({ op: 'setAlpha', args: [alpha] });
    },
    clipRect(x, y, w, h) {
      calls.push({ op: 'clipRect', args: [x, y, w, h] });
    },
    fillRect(x, y, w, h, color) {
      calls.push({ op: 'fillRect', args: [x, y, w, h, color] });
    },
    strokeRect(x, y, w, h, color, lineWidth) {
      calls.push({ op: 'strokeRect', args: [x, y, w, h, color, lineWidth] });
    },
    line(x1, y1, x2, y2, color, options) {
      calls.push({ op: 'line', args: [x1, y1, x2, y2, color, options] });
    },
    polyline(points, color, options) {
      calls.push({ op: 'polyline', args: [points, color, options] });
    },
    fillPolygon(points, color) {
      calls.push({ op: 'fillPolygon', args: [points, color] });
    },
    text(x, y, value, options) {
      calls.push({ op: 'text', args: [x, y, value, options] });
    },
    measureText(value) {
      return value.length * 6.5;
    },
  };
}
