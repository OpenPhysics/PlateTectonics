/**
 * CrustCanvasNode.ts
 *
 * Paints the Crust screen: sky, sea, three blocks of crust and whatever lies beneath
 * them, all coloured by the current colour mode.
 *
 * Canvas rather than a tree of Paths, matching the rest of the sim, and for the same
 * reason: the rock is coloured *per sample* rather than per layer, so a Path-based
 * version would need one node per colour band and would rebuild the whole tree every
 * time a slider moved. Painting it is one pass over a few hundred columns.
 *
 * The picture is built column by column across the viewport. For each column the
 * painter asks the model what is at each depth and fills a run of pixels with the
 * matching material colour. That is slower than filling three rectangles, but it is
 * what makes a continuous geotherm and a continuous density profile visible instead of
 * a cartoon of flat-shaded slabs.
 */

import { Multilink } from "scenerystack/axon";
import type { Bounds2 } from "scenerystack/dot";
import { CanvasNode, type CanvasNodeOptions } from "scenerystack/scenery";
import type { CrossSectionScale } from "../../common/model/CrossSectionScale.js";
import { materialFill } from "../../common/view/EarthMaterial.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import type { CrustModel } from "../model/CrustModel.js";

/** Width of one painted column, view pixels. Small enough that block edges stay crisp. */
const COLUMN_WIDTH = 2;

/** Height of one painted run within a column, view pixels. */
const SAMPLE_HEIGHT = 3;

/** Extra size on each painted tile, view pixels, so neighbours overlap instead of seaming. */
const SEAM_OVERLAP = 0.75;

export type CrustCanvasNodeOptions = CanvasNodeOptions;

export class CrustCanvasNode extends CanvasNode {
  private readonly model: CrustModel;

  /** Named sectionScale, not scale: Node.scale() is a method on the base class. */
  private sectionScale: CrossSectionScale;

  public constructor(
    model: CrustModel,
    sectionScale: CrossSectionScale,
    bounds: Bounds2,
    providedOptions?: CrustCanvasNodeOptions,
  ) {
    super({ canvasBounds: bounds, ...providedOptions });
    this.model = model;
    this.sectionScale = sectionScale;

    // Everything that changes the picture. The colour properties are in here too, so a
    // Projector Mode switch repaints without any special case.
    const repaint = Multilink.multilinkAny(
      [
        model.crustElevationProperty,
        model.crustThicknessProperty,
        model.crustDensityProperty,
        model.temperatureRatioProperty,
        model.colorModeProperty,
        model.zoomProperty,
        PlateTectonicsColors.skyColorProperty,
        PlateTectonicsColors.seaWaterColorProperty,
        PlateTectonicsColors.densityRampLowColorProperty,
        PlateTectonicsColors.densityRampHighColorProperty,
        PlateTectonicsColors.temperatureRampLowColorProperty,
        PlateTectonicsColors.temperatureRampHighColorProperty,
      ],
      () => this.invalidatePaint(),
    );

    this.disposeEmitter.addListener(() => repaint.dispose());
  }

  /** Re-aims the painter at a new vertical scale, after a zoom change. */
  public setSectionScale(sectionScale: CrossSectionScale): void {
    this.sectionScale = sectionScale;
    this.invalidatePaint();
  }

  public override paintCanvas(context: CanvasRenderingContext2D): void {
    const scale = this.sectionScale;
    const model = this.model;
    const bounds = this.canvasBounds;

    // ── Sky and sea ───────────────────────────────────────────────────────────
    // Sea fills everything below sea level first; the rock is then painted over it, so
    // water ends up only where no block reaches the surface. Cheaper and less
    // error-prone than working out the coastline analytically.
    context.fillStyle = PlateTectonicsColors.skyColorProperty.value.toCSS();
    context.fillRect(bounds.minX, bounds.minY, bounds.width, bounds.height);

    context.fillStyle = PlateTectonicsColors.seaWaterColorProperty.value.toCSS();
    const seaLevelY = scale.seaLevelY;
    context.fillRect(bounds.minX, seaLevelY, bounds.width, bounds.maxY - seaLevelY);

    // ── The rock ──────────────────────────────────────────────────────────────
    const mode = model.colorModeProperty.value;

    for (let viewX = bounds.minX; viewX < bounds.maxX; viewX += COLUMN_WIDTH) {
      const xM = scale.modelX(viewX + COLUMN_WIDTH / 2);
      const column = model.columnAt(xM);

      // Between and beyond the blocks there is only mantle, drawn from the top of the
      // deepest block down, so the three blocks read as sitting *in* something.
      const surfaceElevationM = column ? column.elevationM : scale.bandBottomM;
      const topY = scale.y(surfaceElevationM);

      for (let viewY = topY; viewY < bounds.maxY; viewY += SAMPLE_HEIGHT) {
        const elevationM = scale.modelElevation(viewY + SAMPLE_HEIGHT / 2);
        const density = model.densityAtPoint(xM, elevationM);
        const temperature = model.temperatureAtPoint(xM, elevationM);

        context.fillStyle = materialFill(mode, density, temperature).toCSS();
        // Overlapped by SEAM_OVERLAP on both axes. The ScreenView transform scales the
        // canvas by a non-integer factor, so tile edges land mid-device-pixel and get
        // antialiased against whatever is behind them — which paints a fine pale grid
        // over the whole cross-section. Overlapping costs nothing and removes it.
        context.fillRect(
          viewX,
          viewY,
          COLUMN_WIDTH + SEAM_OVERLAP,
          Math.min(SAMPLE_HEIGHT + SEAM_OVERLAP, bounds.maxY - viewY),
        );
      }
    }
  }
}
