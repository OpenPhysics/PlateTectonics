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
 * its own — the limb, the circle where the near hemisphere ends — and all of it lives
 * in {@link GlobeFeaturePainter}, which the Deep Time screen's globe shares. Points
 * facing away are dropped by `EarthProjection.project` in the base class.
 *
 * `clipToViewport` clips to the *disc* rather than to the viewport rectangle, because
 * the painter closes a polygon that runs round the back by detouring to a ring outside
 * the disc and letting the clip trim it away.
 *
 * The relief raster is an equirectangular image, so it cannot just be drawn onto a
 * disc. Instead each pixel of the disc is un-projected back to a longitude and
 * latitude and sampled from the raster, into a texture that is rebuilt only when the
 * camera moves.
 */

import type { CanvasNodeOptions } from "scenerystack/scenery";
import type { GlobeProjection } from "../../common/GlobeProjection.js";
import { GlobeFeaturePainter, type RingMode } from "../../common/view/GlobeFeaturePainter.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import type { EarthModel } from "../model/EarthModel.js";
import { EarthCanvasNode } from "./EarthCanvasNode.js";

const TWO_PI = 2 * Math.PI;

export type GlobeCanvasNodeOptions = CanvasNodeOptions;

export class GlobeCanvasNode extends EarthCanvasNode {
  private readonly globe: GlobeProjection;

  /** Everything about turning a lon/lat polyline into a path on the disc. */
  private readonly painter: GlobeFeaturePainter;

  /** Pixels of the relief raster, read once so the globe texture can sample them. */
  private reliefPixels: ImageData | null = null;

  /** The relief raster resampled onto the disc, and the camera it was built for. */
  private reliefTexture: HTMLCanvasElement | null = null;
  private textureLongitude = Number.NaN;
  private textureLatitude = Number.NaN;

  public constructor(model: EarthModel, projection: GlobeProjection, options?: GlobeCanvasNodeOptions) {
    super(model, projection, options);
    this.globe = projection;
    this.painter = new GlobeFeaturePainter(projection, this.reconstruction);
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
    this.painter.appendFeature(context, coords, frames, mode, tearAtFrameChanges);
  }
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
