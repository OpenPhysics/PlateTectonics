/**
 * GlobeCanvasNode.ts
 *
 * The global map painted onto a rotatable 3-D globe, using the same datasets and the
 * same colours as the flat map — see {@link EarthCanvasNode}, which owns everything
 * the two views share.
 *
 * ── Drawing a sphere as a sphere ──────────────────────────────────────────────
 * The flat map's hard cases (the antimeridian, circumpolar rings) simply do not
 * arise here: a sphere has no seam and no edges. They are replaced by one case of
 * its own — the limb, the circle where the near hemisphere ends — and everything
 * below is about it:
 *
 *  - **Points** (earthquakes, volcanoes, hotspots) are dropped when they face away.
 *    That is handled once, in the base class, by `EarthProjection.project`.
 *  - **Polylines** (coastline outlines, plate outlines, boundaries) are cut at the
 *    limb: the crossing is found by interpolating on `GlobeProjection.depth`, which
 *    changes sign exactly there, so a segment ends *on* the limb rather than at the
 *    last visible vertex.
 *  - **Filled polygons** (plates, land) cannot simply be cut, because a polygon that
 *    runs round the back has to stay closed. Where the outline dips behind the limb
 *    it detours to a ring outside the disc, skirts that ring round to where the
 *    outline reappears, and drops back in. The disc clip then trims the detour away,
 *    leaving a clean round edge. This is the trick NAAP's globe uses, and it is why
 *    `clipToViewport` clips to the disc rather than to the viewport rectangle.
 *
 * The relief raster is an equirectangular image, so it cannot just be drawn onto a
 * disc. Instead each pixel of the disc is un-projected back to a longitude and
 * latitude and sampled from the raster, into a texture that is rebuilt only when the
 * camera moves.
 */

import type { CanvasNodeOptions } from "scenerystack/scenery";
import { wrapLongitude } from "../../common/EarthProjection.js";
import type { GlobeProjection } from "../../common/GlobeProjection.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import type { PlateTectonicsModel } from "../model/PlateTectonicsModel.js";
import { EarthCanvasNode, isSeamSegment, type RingMode } from "./EarthCanvasNode.js";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const TWO_PI = 2 * Math.PI;

/**
 * Radius of the detour ring a filled outline steps out to, as a multiple of the disc
 * radius. It only has to be comfortably outside the disc, where the clip hides it.
 */
const DETOUR_RING_RATIO = 1.5;

/**
 * How far outside the disc the *chords* of the detour ring must stay, as a multiple
 * of the disc radius. This is what sets how finely the ring is stepped: too coarse
 * and a chord would cut back inside the disc and nick the limb.
 */
const DETOUR_CHORD_CLEARANCE = 1.1;

/**
 * Longest piece of a feature, in degrees of arc, that may be drawn as a straight line.
 * At the size the globe is drawn a five-degree arc bows less than a fifth of a pixel
 * away from its chord, so this is about keeping long segments *on the sphere* rather
 * than about smoothness — see {@link GlobeCanvasNode.traceFeature}.
 */
const MAX_SEGMENT_DEGREES = 5;

/** Starting size of the scratch buffers, chosen to cover most features in one go. */
const INITIAL_BUFFER_CAPACITY = 1024;

const mod2pi = (angle: number): number => ((angle % TWO_PI) + TWO_PI) % TWO_PI;

export type GlobeCanvasNodeOptions = CanvasNodeOptions;

export class GlobeCanvasNode extends EarthCanvasNode {
  private readonly globe: GlobeProjection;

  /** Geometry of the detour ring used to close filled outlines round the limb. */
  private readonly detourRadius: number;
  private readonly detourStep: number;

  // Scratch buffers for one traced feature, grown on demand and reused for the next.
  // A feature is projected in full before any of it is drawn: a filled outline has to
  // be walked from a vertex that is safely inside a visible run, and both kinds of
  // path need a vertex's neighbours to decide what to do with it. Reusing the buffers
  // keeps that allocation-free on the frames where the clock or the camera is moving.
  private bufferCount = 0;
  private bufferX = new Float64Array(0);
  private bufferY = new Float64Array(0);
  private bufferLon = new Float64Array(0);
  private bufferLat = new Float64Array(0);
  private bufferDepth = new Float64Array(0);
  private bufferVisible = new Uint8Array(0);
  private bufferFrame = new Int32Array(0);
  private bufferSeam = new Uint8Array(0);

  /** View coordinates written by the most recent {@link projectLimbCrossing} call. */
  private crossingX = 0;
  private crossingY = 0;

  /** Pixels of the relief raster, read once so the globe texture can sample them. */
  private reliefPixels: ImageData | null = null;

  /** The relief raster resampled onto the disc, and the camera it was built for. */
  private reliefTexture: HTMLCanvasElement | null = null;
  private textureLongitude = Number.NaN;
  private textureLatitude = Number.NaN;

  public constructor(model: PlateTectonicsModel, projection: GlobeProjection, options?: GlobeCanvasNodeOptions) {
    super(model, projection, options);
    this.globe = projection;
    this.detourRadius = projection.radius * DETOUR_RING_RATIO;
    this.detourStep = 2 * Math.acos(DETOUR_CHORD_CLEARANCE / DETOUR_RING_RATIO);
  }

  protected override clipToViewport(context: CanvasRenderingContext2D): void {
    context.beginPath();
    context.arc(this.globe.centerX, this.globe.centerY, this.globe.radius, 0, TWO_PI);
    context.clip();
  }

  // ── Base map ────────────────────────────────────────────────────────────────

  protected override paintBase(context: CanvasRenderingContext2D): void {
    const texture = this.showRelief ? this.reliefTextureForCamera() : null;
    if (texture) {
      const size = this.globe.radius * 2;
      context.drawImage(
        texture,
        this.globe.centerX - this.globe.radius,
        this.globe.centerY - this.globe.radius,
        size,
        size,
      );
      return;
    }

    context.fillStyle = PlateTectonicsColors.oceanColorProperty.value.toCSS();
    context.beginPath();
    context.arc(this.globe.centerX, this.globe.centerY, this.globe.radius, 0, TWO_PI);
    context.fill();

    this.paintLandRings(context);
  }

  protected override reliefImageChanged(): void {
    this.reliefPixels = this.reliefImage ? readImagePixels(this.reliefImage) : null;
    this.reliefTexture = null;
  }

  /**
   * The relief raster resampled onto the disc for the current camera, rebuilt only
   * when the camera has moved. Returns null when the raster is unavailable — a build
   * that inlines it from another origin would taint the canvas it is read through —
   * in which case the globe falls back to plain ocean and coastlines.
   */
  private reliefTextureForCamera(): HTMLCanvasElement | null {
    const pixels = this.reliefPixels;
    if (!pixels) {
      return null;
    }

    const longitude = this.globe.centerLongitudeProperty.value;
    const latitude = this.globe.centerLatitudeProperty.value;
    if (this.reliefTexture && longitude === this.textureLongitude && latitude === this.textureLatitude) {
      return this.reliefTexture;
    }

    const size = Math.ceil(this.globe.radius * 2);
    const canvas = this.reliefTexture ?? document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    const target = context.createImageData(size, size);
    const source = pixels.data;
    const sourceWidth = pixels.width;
    const sourceHeight = pixels.height;
    const left = this.globe.centerX - this.globe.radius;
    const top = this.globe.centerY - this.globe.radius;

    const radius = this.globe.radius;
    for (let row = 0; row < size; row++) {
      // Only the pixels on the disc have any Earth under them, and on a row that is
      // `dy` from the centre those run half a chord either side of it. Walking just
      // that span keeps the corners of the square out of the inner loop, which is the
      // one that runs a couple of hundred thousand times every time the globe turns.
      const dy = this.globe.centerY - (top + row + 0.5);
      const halfChordSquared = radius * radius - dy * dy;
      if (halfChordSquared <= 0) {
        continue;
      }
      const halfChord = Math.sqrt(halfChordSquared);
      const firstColumn = Math.max(0, Math.floor(this.globe.centerX - halfChord - left));
      const lastColumn = Math.min(size - 1, Math.ceil(this.globe.centerX + halfChord - left));

      for (let column = firstColumn; column <= lastColumn; column++) {
        // Sample at pixel centres, so the disc is not half a pixel off.
        if (!this.globe.unproject(left + column + 0.5, top + row + 0.5)) {
          continue; // outside the globe: left transparent
        }
        const sourceColumn = Math.min(sourceWidth - 1, Math.floor(((this.globe.lon + 180) / 360) * sourceWidth));
        const sourceRow = Math.min(sourceHeight - 1, Math.floor(((90 - this.globe.lat) / 180) * sourceHeight));
        const from = (sourceRow * sourceWidth + sourceColumn) * 4;
        const to = (row * size + column) * 4;
        target.data[to] = source[from] as number;
        target.data[to + 1] = source[from + 1] as number;
        target.data[to + 2] = source[from + 2] as number;
        target.data[to + 3] = 255;
      }
    }
    context.putImageData(target, 0, 0);

    this.reliefTexture = canvas;
    this.textureLongitude = longitude;
    this.textureLatitude = latitude;
    return canvas;
  }

  // ── Path helpers ────────────────────────────────────────────────────────────

  protected override appendFeature(
    context: CanvasRenderingContext2D,
    coords: readonly number[],
    frames: number | readonly number[],
    mode: RingMode,
    tearAtFrameChanges = false,
  ): void {
    const count = this.traceFeature(coords, frames);
    if (mode === "fill") {
      this.appendFilledOutline(context, count);
    } else {
      // Same tear rule as the flat map: once the plates have moved, neighbouring
      // coastline vertices riding different plates are hundreds of kilometres apart,
      // and joining them would draw a stray line across the ocean.
      const breakAtFrameChanges = tearAtFrameChanges && typeof frames !== "number" && !this.reconstruction.isPresentDay;
      this.appendVisiblePolyline(context, count, breakAtFrameChanges);
    }
  }

  /**
   * Projects a feature's vertices into the scratch buffers, subdividing any segment
   * long enough for the difference between a great circle and a straight line to show.
   *
   * That difference is the whole reason this step exists. The datasets were shaped for
   * a flat map, where a straight line between two vertices is the right answer and
   * long segments are harmless: the Pacific plate's eastern edge runs 66° of latitude
   * up the antimeridian in a single step. Drawn straight on a globe, that step is a
   * chord — a line clean across the disc, cutting through the middle of the Earth
   * instead of following its surface. Sampling the great circle every few degrees puts
   * it back on the surface, where the limb can then hide the part that is round the back.
   *
   * Returns how many points were buffered.
   */
  private traceFeature(coords: readonly number[], frames: number | readonly number[]): number {
    const perVertex = typeof frames !== "number";
    const sourceCount = coords.length / 2;
    this.bufferCount = 0;

    let previousLon = 0;
    let previousLat = 0;

    for (let vertex = 0; vertex < sourceCount; vertex++) {
      const frame = perVertex ? ((frames[vertex] as number) ?? 0) : frames;
      const sourceLon = coords[vertex * 2] as number;
      const sourceLat = coords[vertex * 2 + 1] as number;
      // Whether the segment arriving here is a seam, judged on the *source*
      // coordinates: a seam is a property of how the dataset was cut, not of where
      // the reconstruction has since carried it.
      const seam =
        vertex > 0 &&
        isSeamSegment(coords[vertex * 2 - 2] as number, coords[vertex * 2 - 1] as number, sourceLon, sourceLat);

      this.reconstruction.transform(sourceLon, sourceLat, frame);
      const lon = this.reconstruction.lon;
      const lat = this.reconstruction.lat;

      if (vertex > 0) {
        const steps = subdivisionsFor(previousLon, previousLat, lon, lat);
        for (let step = 1; step < steps; step++) {
          // Interpolated points belong to the segment they came from, so a tear
          // between two plates still falls on the last step of the segment.
          interpolateGreatCircle(previousLon, previousLat, lon, lat, step / steps);
          this.pushVertex(interpolatedLon, interpolatedLat, frame, seam);
        }
      }

      this.pushVertex(lon, lat, frame, seam);
      previousLon = lon;
      previousLat = lat;
    }
    return this.bufferCount;
  }

  /** Projects one point and appends it to the scratch buffers. */
  private pushVertex(lon: number, lat: number, frame: number, seam: boolean): void {
    if (this.bufferCount === this.bufferX.length) {
      this.growBuffers();
    }
    const at = this.bufferCount;
    this.bufferVisible[at] = this.globe.project(lon, lat) ? 1 : 0;
    this.bufferX[at] = this.globe.x;
    this.bufferY[at] = this.globe.y;
    this.bufferLon[at] = lon;
    this.bufferLat[at] = lat;
    this.bufferDepth[at] = this.globe.depth;
    this.bufferFrame[at] = frame;
    this.bufferSeam[at] = seam ? 1 : 0;
    this.bufferCount = at + 1;
  }

  /** Doubles every scratch buffer, keeping what is already in them. */
  private growBuffers(): void {
    const capacity = Math.max(INITIAL_BUFFER_CAPACITY, this.bufferX.length * 2);
    const grow = (buffer: Float64Array<ArrayBuffer>): Float64Array<ArrayBuffer> => {
      const grown = new Float64Array(capacity);
      grown.set(buffer);
      return grown;
    };
    this.bufferX = grow(this.bufferX);
    this.bufferY = grow(this.bufferY);
    this.bufferLon = grow(this.bufferLon);
    this.bufferLat = grow(this.bufferLat);
    this.bufferDepth = grow(this.bufferDepth);

    const visible = new Uint8Array(capacity);
    visible.set(this.bufferVisible);
    this.bufferVisible = visible;

    const seam = new Uint8Array(capacity);
    seam.set(this.bufferSeam);
    this.bufferSeam = seam;

    const frame = new Int32Array(capacity);
    frame.set(this.bufferFrame);
    this.bufferFrame = frame;
  }

  /**
   * Appends the visible parts of an open or stroked polyline, cutting each run at the
   * limb so a line never continues across the face of the Earth from a point that is
   * really round the back.
   */
  private appendVisiblePolyline(context: CanvasRenderingContext2D, count: number, breakAtFrameChanges: boolean): void {
    let penDown = false;

    for (let index = 1; index < count; index++) {
      const previous = index - 1;
      const torn =
        this.bufferSeam[index] === 1 || (breakAtFrameChanges && this.bufferFrame[index] !== this.bufferFrame[previous]);
      penDown = this.linkVertices(context, previous, index, penDown, torn);
    }
  }

  /**
   * Draws the segment between two consecutive buffered vertices, in whichever of the
   * four ways their visibility calls for, and reports whether the pen is left at `to`.
   */
  private linkVertices(
    context: CanvasRenderingContext2D,
    from: number,
    to: number,
    penDown: boolean,
    torn: boolean,
  ): boolean {
    const fromVisible = this.bufferVisible[from] === 1;
    const toVisible = this.bufferVisible[to] === 1;
    const toX = this.bufferX[to] as number;
    const toY = this.bufferY[to] as number;

    if (fromVisible && toVisible) {
      if (torn) {
        // The two vertices ride frames that have moved apart: start a new run rather
        // than drawing a stray line across the gap.
        context.moveTo(toX, toY);
        return true;
      }
      if (!penDown) {
        context.moveTo(this.bufferX[from] as number, this.bufferY[from] as number);
      }
      context.lineTo(toX, toY);
      return true;
    }

    if (fromVisible) {
      // Leaving the near side: finish the run exactly on the limb.
      if (!penDown) {
        context.moveTo(this.bufferX[from] as number, this.bufferY[from] as number);
      }
      this.projectLimbCrossing(from, to);
      context.lineTo(this.crossingX, this.crossingY);
      return false;
    }

    if (toVisible) {
      // Coming back into view: start the run on the limb.
      this.projectLimbCrossing(from, to);
      context.moveTo(this.crossingX, this.crossingY);
      context.lineTo(toX, toY);
      return true;
    }

    return false;
  }

  /**
   * Appends a closed outline for filling. The outline is traced for real, so bays and
   * peninsulas survive; wherever it dips behind the limb it steps out to the detour
   * ring, skirts round to where it reappears, and drops back in. Nothing is drawn for
   * a polygon that is entirely on the far side.
   */
  private appendFilledOutline(context: CanvasRenderingContext2D, count: number): void {
    if (count < 3) {
      return;
    }

    // Start from a vertex whose predecessor is also visible, so the walk never opens
    // on a limb crossing — there would be no exit angle to detour from.
    let start = -1;
    for (let i = 1; i < count; i++) {
      if (this.bufferVisible[i] === 1 && this.bufferVisible[i - 1] === 1) {
        start = i;
        break;
      }
    }
    if (start < 0) {
      return;
    }

    context.moveTo(this.bufferX[start] as number, this.bufferY[start] as number);
    let wasHidden = false;
    let exitAngle = 0;

    for (let k = 1; k < count; k++) {
      const index = (start + k) % count;
      const previousIndex = (index + count - 1) % count;

      if (this.bufferVisible[index] === 0) {
        if (!wasHidden) {
          // Going round the back. Leave the disc *at the limb*, not on the bearing of
          // the hidden vertex: a hidden point projects inside the disc too, and can
          // sit right across the other side of it, so stepping straight out to its
          // bearing would draw a line clean across the face of the Earth.
          this.projectLimbCrossing(previousIndex, index);
          context.lineTo(this.crossingX, this.crossingY);
          exitAngle = this.angleAt(this.crossingX, this.crossingY);
          this.lineToDetour(context, exitAngle);
        }
        wasHidden = true;
      } else {
        if (wasHidden) {
          // Coming back: skirt round to where the outline re-crosses the limb, drop
          // back in there, and carry on along the visible outline.
          this.projectLimbCrossing(previousIndex, index);
          this.skirtDetourRing(context, exitAngle, this.angleAt(this.crossingX, this.crossingY));
          context.lineTo(this.crossingX, this.crossingY);
        }
        context.lineTo(this.bufferX[index] as number, this.bufferY[index] as number);
        wasHidden = false;
      }
    }
    context.closePath();
  }

  /** Screen bearing of a point from the centre of the disc. */
  private angleAt(x: number, y: number): number {
    return Math.atan2(y - this.globe.centerY, x - this.globe.centerX);
  }

  /** Draws out to the detour ring at the given bearing. */
  private lineToDetour(context: CanvasRenderingContext2D, angle: number): void {
    context.lineTo(
      this.globe.centerX + this.detourRadius * Math.cos(angle),
      this.globe.centerY + this.detourRadius * Math.sin(angle),
    );
  }

  /**
   * Follows the detour ring from one bearing to another, the short way round — which
   * is the way the hidden part of the outline went, for any feature that does not
   * wrap more than half the globe.
   */
  private skirtDetourRing(context: CanvasRenderingContext2D, fromAngle: number, toAngle: number): void {
    let arc = mod2pi(toAngle - fromAngle);
    const direction = arc > Math.PI ? -1 : 1;
    if (arc > Math.PI) {
      arc = TWO_PI - arc;
    }
    const segments = Math.max(1, Math.ceil(arc / this.detourStep));
    for (let step = 1; step <= segments; step++) {
      this.lineToDetour(context, fromAngle + (direction * arc * step) / segments);
    }
  }

  /**
   * Projects the point where the segment between two buffered vertices crosses the
   * limb, writing its view coordinates to {@link crossingX} and {@link crossingY}.
   *
   * `depth` is the cosine of the angular distance from the camera, so it is zero
   * exactly on the limb: interpolating the two endpoints by the fraction that zeroes
   * it lands on the crossing.
   */
  private projectLimbCrossing(from: number, to: number): void {
    const fromDepth = this.bufferDepth[from] as number;
    const toDepth = this.bufferDepth[to] as number;
    interpolateGreatCircle(
      this.bufferLon[from] as number,
      this.bufferLat[from] as number,
      this.bufferLon[to] as number,
      this.bufferLat[to] as number,
      fromDepth / (fromDepth - toDepth),
    );
    this.globe.project(interpolatedLon, interpolatedLat);
    this.crossingX = this.globe.x;
    this.crossingY = this.globe.y;
  }
}

// ── Spherical geometry helpers ────────────────────────────────────────────────
// These write to module-level scratch variables rather than returning an object,
// because they run inside the per-vertex loops of a canvas repaint.

/** Longitude written by the most recent {@link interpolateGreatCircle} call. */
let interpolatedLon = 0;

/** Latitude written by the most recent {@link interpolateGreatCircle} call. */
let interpolatedLat = 0;

/**
 * Writes the point a fraction `t` of the way from one geographic point to another
 * along the great circle between them, to {@link interpolatedLon} / {@link interpolatedLat}.
 *
 * The two points are taken to the unit sphere, mixed, and pushed back out to it. That
 * is not a constant-speed traverse of the arc — the samples bunch towards the ends of a
 * long segment — but it lands exactly on the great circle, which is all that is asked
 * of it here, and it costs no trigonometry beyond the conversions.
 */
function interpolateGreatCircle(lonA: number, latA: number, lonB: number, latB: number, t: number): void {
  const latARad = latA * DEG_TO_RAD;
  const lonARad = lonA * DEG_TO_RAD;
  const cosLatA = Math.cos(latARad);
  const ax = cosLatA * Math.cos(lonARad);
  const ay = cosLatA * Math.sin(lonARad);
  const az = Math.sin(latARad);

  const latBRad = latB * DEG_TO_RAD;
  const lonBRad = lonB * DEG_TO_RAD;
  const cosLatB = Math.cos(latBRad);
  const bx = cosLatB * Math.cos(lonBRad);
  const by = cosLatB * Math.sin(lonBRad);
  const bz = Math.sin(latBRad);

  const x = ax + (bx - ax) * t;
  const y = ay + (by - ay) * t;
  const z = az + (bz - az) * t;
  const length = Math.hypot(x, y, z) || 1;

  interpolatedLon = Math.atan2(y, x) * RAD_TO_DEG;
  interpolatedLat = Math.asin(Math.max(-1, Math.min(1, z / length))) * RAD_TO_DEG;
}

/**
 * How many pieces a segment between two geographic points has to be cut into to stay
 * within {@link MAX_SEGMENT_DEGREES} of arc per piece. One means "leave it alone",
 * which is the answer for almost every segment in the data.
 *
 * The separation is the flat-Earth approximation — near enough at these sizes, and it
 * only decides how finely to sample.
 */
function subdivisionsFor(lonA: number, latA: number, lonB: number, latB: number): number {
  const deltaLat = latB - latA;
  const deltaLon = wrapLongitude(lonB - lonA);
  const meanLat = ((latA + latB) / 2) * DEG_TO_RAD;
  const separation = Math.hypot(deltaLat, deltaLon * Math.cos(meanLat));
  return separation <= MAX_SEGMENT_DEGREES ? 1 : Math.ceil(separation / MAX_SEGMENT_DEGREES);
}

/**
 * Reads an image's pixels through an offscreen canvas. Returns null if the browser
 * refuses — a cross-origin image taints the canvas it is drawn on — so the caller can
 * fall back rather than throw.
 */
function readImagePixels(image: HTMLImageElement): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }
  context.drawImage(image, 0, 0);
  try {
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return null;
  }
}
