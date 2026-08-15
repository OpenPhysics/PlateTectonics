/**
 * QuadRenderer.ts
 *
 * Collects the faces of the 3-D block, sorts them back to front, and fills them.
 *
 * ── Why a sort and not a depth buffer ─────────────────────────────────────────
 * The block is drawn onto a 2-D canvas, which has no per-pixel depth. The classic
 * substitute is the painter's algorithm: draw the far faces first and let the near ones
 * cover them. That is exact only when no two faces interpenetrate and no three overlap
 * cyclically, and everything on these screens satisfies that — a terrain heightfield is
 * a graph over the ground plane, and the cross-section is a stack of bands on one flat
 * sheet at the front of the block. Where depth genuinely cannot decide the order,
 * {@link FaceOptions.layer} does, which is this renderer's version of the
 * `moveToFrontNotifier` PhET's Java version used for the same purpose.
 *
 * ── Why the faces are pooled ──────────────────────────────────────────────────
 * The Plate Motion block repaints every frame while the clock runs, and a full block is
 * a couple of thousand faces. Allocating those each frame — and the sort's comparator
 * closures with them — would put the frame budget into the garbage collector. So faces
 * are written into a pool that grows once and is then reused, and the sort runs over an
 * index array rather than over the faces themselves. This is the same reasoning that
 * makes `PlateReconstruction.transform` write into scratch fields.
 *
 * ── Shading ───────────────────────────────────────────────────────────────────
 * Each face gets one Lambert factor from its own normal, so the top of the block is lit
 * and its sides fall away. That is flat shading — every face is one colour, and the
 * facets are visible where the terrain is coarse. Java had a real GPU with per-vertex
 * normals and a tiled noise texture over the top; this is the honest limit of what a
 * canvas fill can do, and the terrain grid is sampled finely enough that it reads as a
 * surface rather than as a set of plates.
 *
 * Pure apart from the canvas it is handed, and unit-tested in tests/QuadRenderer.test.ts.
 */

import type { Vector3 } from "scenerystack/dot";
import type { Color } from "scenerystack/scenery";
import type { SceneCamera } from "./SceneCamera.js";

/**
 * Direction the light comes from, in scene coordinates: high, in front, and a little to
 * the left. Chosen so the top face of the block is the brightest thing in the picture
 * and the left and right ends are shaded differently from each other, which is what
 * makes the block read as a solid rather than as a silhouette.
 */
const LIGHT_DIRECTION = { x: -0.35, y: 0.86, z: 0.37 };

/** How much of a face's colour survives with no light on it at all. */
const AMBIENT = 0.62;

/** Faces with fewer than three vertices enclose no area and are dropped. */
const MIN_VERTICES = 3;

export type FaceOptions = {
  /**
   * Draw-order group. Higher groups are drawn after — and therefore over — lower ones,
   * whatever their depth. Faces that share a group are ordered back to front as usual.
   * Use it for things that are coplanar, where depth cannot break the tie: the bands of
   * the cross-section all sit on the front face of the block at one z.
   */
  layer?: number;

  /**
   * Drop the face when its projected outline winds clockwise, meaning it is being seen
   * from behind. Only meaningful for faces of a closed solid, wound counter-clockwise
   * when seen from outside; a flat sheet such as the cross-section has no back and must
   * leave this off.
   */
  cull?: boolean;

  /** Modulate the fill by the face's Lambert factor. On by default. */
  shade?: boolean;

  /** Outline colour. Mostly used to hide the hairline seams between adjacent fills. */
  stroke?: Color | null;

  /** Width of that outline, view pixels. */
  lineWidth?: number;
};

/** One face, held in the pool. Its coordinate arrays are reused between repaints. */
type PooledFace = {
  xs: number[];
  ys: number[];
  count: number;
  depth: number;
  layer: number;
  fill: string;
  stroke: string | null;
  lineWidth: number;
};

function createFace(): PooledFace {
  return { xs: [], ys: [], count: 0, depth: 0, layer: 0, fill: "", stroke: null, lineWidth: 1 };
}

/**
 * How bright a face pointing along `normal` is, 0 to 1.
 *
 * Exported so the terrain and the water can shade themselves consistently with anything
 * that has to compute a colour before it reaches the renderer.
 */
export function lambertFactor(nx: number, ny: number, nz: number): number {
  const length = Math.hypot(nx, ny, nz);
  if (length === 0) {
    return 1;
  }
  const dot = (nx * LIGHT_DIRECTION.x + ny * LIGHT_DIRECTION.y + nz * LIGHT_DIRECTION.z) / length;
  return AMBIENT + (1 - AMBIENT) * Math.max(0, dot);
}

/** `color` dimmed to `factor` of its brightness, as a CSS string. */
export function shadeToCSS(color: Color, factor: number): string {
  const r = Math.round(Math.max(0, Math.min(255, color.r * factor)));
  const g = Math.round(Math.max(0, Math.min(255, color.g * factor)));
  const b = Math.round(Math.max(0, Math.min(255, color.b * factor)));
  return color.a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${color.a})`;
}

export class QuadRenderer {
  private readonly faces: PooledFace[] = [];
  private readonly order: number[] = [];

  /** How many pool entries hold a face this repaint. Everything past it is stale. */
  private used = 0;

  private camera: SceneCamera;

  public constructor(camera: SceneCamera) {
    this.camera = camera;
  }

  /** Re-aims the renderer after a layout or zoom change. */
  public setCamera(camera: SceneCamera): void {
    this.camera = camera;
  }

  /** Drops everything collected so far, keeping the pool. Call once per repaint. */
  public clear(): void {
    this.used = 0;
  }

  /** How many faces are currently collected — the sort cost, and a test hook. */
  public get faceCount(): number {
    return this.used;
  }

  /**
   * Adds one face of the block.
   *
   * `points` are scene coordinates, already curved by EarthCurvature, wound
   * counter-clockwise as seen from outside the solid. The face is silently dropped if
   * any vertex is behind the eye: a face straddling the eye plane cannot be projected,
   * and at the distances these blocks are viewed from that never happens to a face that
   * should have been visible.
   */
  public addFace(points: readonly Vector3[], color: Color, options?: FaceOptions): void {
    if (points.length < MIN_VERTICES) {
      return;
    }

    const face = this.faces[this.used] ?? createFace();
    this.faces[this.used] = face;

    let depthSum = 0;
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (!point) {
        return;
      }
      const projected = this.camera.project(point);
      if (!projected.visible) {
        return;
      }
      face.xs[i] = projected.x;
      face.ys[i] = projected.y;
      depthSum += projected.depth;
    }
    face.count = points.length;

    // Twice the signed area of the projected outline. View y runs down the screen, so a
    // face wound counter-clockwise in the scene comes out negative here; that sign is
    // what "seen from the front" means once projected.
    if (options?.cull) {
      let doubleArea = 0;
      for (let i = 0; i < face.count; i++) {
        const j = (i + 1) % face.count;
        doubleArea += (face.xs[i] ?? 0) * (face.ys[j] ?? 0) - (face.xs[j] ?? 0) * (face.ys[i] ?? 0);
      }
      if (doubleArea > 0) {
        return;
      }
    }

    face.depth = depthSum / face.count;
    face.layer = options?.layer ?? 0;
    face.lineWidth = options?.lineWidth ?? 1;
    face.stroke = options?.stroke ? options.stroke.toCSS() : null;

    if (options?.shade === false) {
      face.fill = color.toCSS();
    } else {
      const a = points[0];
      const b = points[1];
      const c = points[2];
      if (!(a && b && c)) {
        return;
      }
      const ux = b.x - a.x;
      const uy = b.y - a.y;
      const uz = b.z - a.z;
      const vx = c.x - a.x;
      const vy = c.y - a.y;
      const vz = c.z - a.z;
      face.fill = shadeToCSS(color, lambertFactor(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx));
    }

    this.used++;
  }

  /**
   * Draws everything collected, furthest first.
   *
   * Ordered by layer and then by decreasing depth, so a nearer face covers a further one
   * and an explicit layer beats both. The sort runs over indices to keep the pooled
   * faces where they are.
   */
  public paint(context: CanvasRenderingContext2D): void {
    const faces = this.faces;
    const order = this.order;
    order.length = this.used;
    for (let i = 0; i < this.used; i++) {
      order[i] = i;
    }

    order.sort((a, b) => {
      const faceA = faces[a];
      const faceB = faces[b];
      if (!(faceA && faceB)) {
        return 0;
      }
      return faceA.layer !== faceB.layer ? faceA.layer - faceB.layer : faceB.depth - faceA.depth;
    });

    for (const index of order) {
      const face = faces[index];
      if (!face) {
        continue;
      }
      context.beginPath();
      context.moveTo(face.xs[0] ?? 0, face.ys[0] ?? 0);
      for (let i = 1; i < face.count; i++) {
        context.lineTo(face.xs[i] ?? 0, face.ys[i] ?? 0);
      }
      context.closePath();

      context.fillStyle = face.fill;
      context.fill();

      // Stroking a face in its own fill colour is how the seams between neighbouring
      // fills are closed. The canvas is drawn at a non-integer scale, so shared edges
      // land mid-device-pixel and antialias against whatever is behind them, which
      // paints a fine pale grid over the whole block — the same artifact
      // CrustCanvasNode's SEAM_OVERLAP exists to remove, and a polygon cannot be
      // overlapped the way a rectangle can.
      if (face.stroke !== null) {
        context.strokeStyle = face.stroke;
        context.lineWidth = face.lineWidth;
        context.stroke();
      } else {
        context.strokeStyle = face.fill;
        context.lineWidth = 1;
        context.stroke();
      }
    }
  }
}
