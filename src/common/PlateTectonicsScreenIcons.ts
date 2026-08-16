/**
 * PlateTectonicsScreenIcons.ts
 *
 * The home-screen and navigation-bar icons, drawn on the standard PhET 548 × 373
 * canvas. One factory per screen, each showing the one picture that carries what that
 * screen is about: the Earth's land and plate boundaries for the global map, three
 * blocks floating at three different heights for the Crust screen, and a spreading
 * ridge for Plate Motion.
 */
import { Multilink } from "scenerystack/axon";
import { Bounds2 } from "scenerystack/dot";
import { Shape } from "scenerystack/kite";
import { CanvasNode, Node, Path, Rectangle } from "scenerystack/scenery";
import { ScreenIcon } from "scenerystack/sim";
import PlateTectonicsColors from "../PlateTectonicsColors.js";
import { DeepTimeReconstruction, HISTORY_OLDEST_MA } from "./DeepTimeReconstruction.js";
import type { BoundaryType } from "./data/dataTypes.js";
import { BOUNDARY_SEGMENTS } from "./data/generated/boundaryData.js";
import { LAND_RINGS } from "./data/generated/landData.js";
import { HISTORY_COASTLINES } from "./data/generated/plateHistoryData.js";

const W = 548;
const H = 373;

/** Longitude jump (degrees) that means a polyline wrapped across the antimeridian. */
const ANTIMERIDIAN_JUMP = 180;

/**
 * How close to ±180° or a pole a vertex has to be to count as a dataset seam. Copied
 * from `EarthCanvasNode` so this file does not import the live map renderer.
 */
const SEAM_TOLERANCE_DEGREES = 1e-6;

/** Coastline stroke at icon resolution; thick enough to survive navigation-bar scaling. */
const ICON_COASTLINE_LINE_WIDTH = 2;

/** Plate-boundary stroke at icon resolution. */
const ICON_BOUNDARY_LINE_WIDTH = 3.2;

type ColorProperty = (typeof PlateTectonicsColors)["mantleColorProperty"];

type RingMode = "fill" | "stroke" | "open";

function polygon(points: readonly (readonly [number, number])[], fill: ColorProperty): Path {
  const shape = new Shape();
  points.forEach(([x, y], index) => {
    if (index === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  });
  shape.close();
  return new Path(shape, { fill });
}

function iconFrom(content: Node): ScreenIcon {
  return new ScreenIcon(content, {
    maxIconWidthProportion: 1,
    maxIconHeightProportion: 1,
    fill: PlateTectonicsColors.backgroundColorProperty,
  });
}

function isSeamSegment(lonA: number, latA: number, lonB: number, latB: number): boolean {
  const onAntimeridian =
    Math.abs(Math.abs(lonA) - 180) < SEAM_TOLERANCE_DEGREES && Math.abs(Math.abs(lonB) - 180) < SEAM_TOLERANCE_DEGREES;
  const alongPole =
    Math.abs(Math.abs(latA) - 90) < SEAM_TOLERANCE_DEGREES && Math.abs(Math.abs(latB) - 90) < SEAM_TOLERANCE_DEGREES;
  return onAntimeridian || alongPole;
}

/**
 * Sinusoidal (Sanson–Flamsteed) x. Equirectangular stretched Antarctica across the
 * full width of the card — the same ice twice, once on each edge — because a pole
 * on a rectangle has nowhere to go. Scaling longitude by cos(latitude) pinches the
 * meridians to a point at each pole, so Antarctica is one continent at the bottom.
 */
function viewX(lon: number, lat: number): number {
  return W / 2 + (lon / 180) * (W / 2) * Math.cos((lat * Math.PI) / 180);
}

/** Linear y; stretched to the icon's 548 × 373 so the map fills the card. */
function viewY(lat: number): number {
  return ((90 - lat) / 180) * H;
}

function boundaryColor(type: BoundaryType): string {
  if (type === "divergent") {
    return PlateTectonicsColors.divergentBoundaryColorProperty.value.toCSS();
  }
  return type === "convergent"
    ? PlateTectonicsColors.convergentBoundaryColorProperty.value.toCSS()
    : PlateTectonicsColors.transformBoundaryColorProperty.value.toCSS();
}

/**
 * Traces one present-day polyline onto the icon.
 *
 * Unlike the live flat map, this does not unwrap across the antimeridian or repeat the
 * world a copy to either side. Those copies are what painted Antarctica twice — once
 * on the left edge and once on the right — on a rectangular projection. A jump across
 * the dateline, or a seam the dataset was cut along, just starts a new subpath.
 */
function appendFeature(context: CanvasRenderingContext2D, coords: readonly number[], mode: RingMode): void {
  let previousLon = Number.NaN;

  for (let i = 0; i < coords.length; i += 2) {
    const lon = coords[i] as number;
    const lat = coords[i + 1] as number;
    const x = viewX(lon, lat);
    const y = viewY(lat);
    const seam = i >= 2 && isSeamSegment(coords[i - 2] as number, coords[i - 1] as number, lon, lat);
    const wrapped = i >= 2 && Math.abs(lon - previousLon) > ANTIMERIDIAN_JUMP;
    // Fills keep the polar seam — in this projection it collapses to the pole and
    // closes Antarctica as one continent. Strokes and any non-polar dateline jump
    // start a new subpath so a chord is not drawn across the ocean.
    const torn = mode === "fill" ? wrapped && !seam : wrapped || seam;
    if (i === 0 || torn) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
    previousLon = lon;
  }

  if (mode === "fill") {
    context.closePath();
  }
}

/**
 * Present-day map of the Earth, painted from the same coastlines and plate boundaries
 * the first screen uses. A canvas rather than a Path per ring, for the same reason the
 * live map is: there are too many vertices for a scenery tree.
 */
class EarthMapIconNode extends CanvasNode {
  public constructor() {
    super({ canvasBounds: new Bounds2(0, 0, W, H) });

    Multilink.multilinkAny(
      [
        PlateTectonicsColors.oceanColorProperty,
        PlateTectonicsColors.landColorProperty,
        PlateTectonicsColors.coastlineColorProperty,
        PlateTectonicsColors.divergentBoundaryColorProperty,
        PlateTectonicsColors.convergentBoundaryColorProperty,
        PlateTectonicsColors.transformBoundaryColorProperty,
      ],
      () => this.invalidatePaint(),
    );
  }

  public override paintCanvas(context: CanvasRenderingContext2D): void {
    context.fillStyle = PlateTectonicsColors.oceanColorProperty.value.toCSS();
    context.fillRect(0, 0, W, H);

    context.fillStyle = PlateTectonicsColors.landColorProperty.value.toCSS();
    for (const ring of LAND_RINGS) {
      context.beginPath();
      appendFeature(context, ring.coords, "fill");
      context.fill();
    }

    context.strokeStyle = PlateTectonicsColors.coastlineColorProperty.value.toCSS();
    context.lineWidth = ICON_COASTLINE_LINE_WIDTH;
    context.lineJoin = "round";
    context.lineCap = "round";
    for (const ring of LAND_RINGS) {
      context.beginPath();
      appendFeature(context, ring.coords, "stroke");
      context.stroke();
    }

    context.lineWidth = ICON_BOUNDARY_LINE_WIDTH;
    for (const type of ["convergent", "divergent", "transform"] as const) {
      context.strokeStyle = boundaryColor(type);
      context.beginPath();
      for (const segment of BOUNDARY_SEGMENTS) {
        if (segment.type === type) {
          appendFeature(context, segment.coords, "open");
        }
      }
      context.stroke();
    }
  }
}

export function createEarthIcon(): ScreenIcon {
  return iconFrom(new EarthMapIconNode());
}

/**
 * The Crust screen: three blocks of crust floating in the mantle at three different
 * heights, with roots proportional to how high they stand. That proportionality is the
 * whole content of Airy isostasy — the block that stands highest also reaches deepest —
 * and it is visible at icon size in a way a single block would not be.
 */
export function createCrustIcon(): ScreenIcon {
  const seaLevelY = 168;
  const blockWidth = W / 3;

  /** [top elevation px above sea level, thickness px] for each block, left to right. */
  const blocks: readonly (readonly [number, number])[] = [
    [-34, 44],
    [10, 96],
    [46, 150],
  ];

  const children: Node[] = [
    new Rectangle(0, 0, W, H, { fill: PlateTectonicsColors.skyColorProperty }),
    new Rectangle(0, seaLevelY, W, H - seaLevelY, { fill: PlateTectonicsColors.mantleColorProperty }),
    new Rectangle(0, seaLevelY - 58, W, 58, { fill: PlateTectonicsColors.seaWaterColorProperty }),
  ];

  blocks.forEach(([topOffset, thickness], index) => {
    const left = index * blockWidth;
    const top = seaLevelY - topOffset;
    children.push(
      new Rectangle(left, top, blockWidth, thickness, {
        fill:
          index === 1
            ? PlateTectonicsColors.continentalCrustColorProperty
            : PlateTectonicsColors.oceanicCrustColorProperty,
        stroke: PlateTectonicsColors.lithosphereColorProperty,
        lineWidth: 3,
      }),
    );
  });

  return iconFrom(new Node({ children }));
}

/**
 * The Plate Motion screen: two plates drawing apart over a spreading ridge, with new
 * ocean floor between them. A cross-section rather than a map so it stays distinguishable
 * from createEarthIcon().
 */
export function createPlateMotionIcon(): ScreenIcon {
  const seaLevelY = 150;
  const crustDepth = 52;
  const gapHalfWidth = 74;

  const children: Node[] = [
    new Rectangle(0, 0, W, H, { fill: PlateTectonicsColors.skyColorProperty }),
    new Rectangle(0, seaLevelY, W, H - seaLevelY, { fill: PlateTectonicsColors.mantleColorProperty }),
    new Rectangle(0, seaLevelY - 46, W, 46, { fill: PlateTectonicsColors.seaWaterColorProperty }),

    // Magma rising to the axis from below, the reason the ridge is there at all.
    polygon(
      [
        [W / 2 - 26, seaLevelY],
        [W / 2 + 26, seaLevelY],
        [W / 2 + 84, H],
        [W / 2 - 84, H],
      ],
      PlateTectonicsColors.magmaColorProperty,
    ),

    // The two plates, pulled back from the axis.
    new Rectangle(0, seaLevelY, W / 2 - gapHalfWidth, crustDepth, {
      fill: PlateTectonicsColors.oceanicCrustColorProperty,
    }),
    new Rectangle(W / 2 + gapHalfWidth, seaLevelY, W / 2 - gapHalfWidth, crustDepth, {
      fill: PlateTectonicsColors.oceanicCrustColorProperty,
    }),

    // New floor filling the gap, standing higher at the axis because it is still hot.
    polygon(
      [
        [W / 2 - gapHalfWidth, seaLevelY],
        [W / 2, seaLevelY - 26],
        [W / 2 + gapHalfWidth, seaLevelY],
        [W / 2 + gapHalfWidth, seaLevelY + crustDepth],
        [W / 2 - gapHalfWidth, seaLevelY + crustDepth],
      ],
      PlateTectonicsColors.newCrustColorProperty,
    ),
  ];

  return iconFrom(new Node({ children }));
}

/**
 * Present-day continents reconstructed to the oldest instant the model covers, drawn
 * from the same coastlines the Deep Time screen carries.
 *
 * Pangaea is the picture: at 250 Ma every continent has gathered into one mass, which
 * is unmistakable at icon size and is the thing the screen exists to show. Painted
 * through {@link DeepTimeReconstruction} rather than baked as a separate outline, so
 * the icon can never drift out of step with the data.
 */
class PangaeaIconNode extends CanvasNode {
  private readonly reconstruction = new DeepTimeReconstruction();

  public constructor() {
    super({ canvasBounds: new Bounds2(0, 0, W, H) });

    Multilink.multilinkAny([PlateTectonicsColors.oceanColorProperty, PlateTectonicsColors.landColorProperty], () =>
      this.invalidatePaint(),
    );
  }

  public override paintCanvas(context: CanvasRenderingContext2D): void {
    this.reconstruction.setTime(HISTORY_OLDEST_MA);

    context.fillStyle = PlateTectonicsColors.oceanColorProperty.value.toCSS();
    context.fillRect(0, 0, W, H);

    context.fillStyle = PlateTectonicsColors.landColorProperty.value.toCSS();
    context.strokeStyle = PlateTectonicsColors.coastlineColorProperty.value.toCSS();
    context.lineWidth = ICON_COASTLINE_LINE_WIDTH;

    // Reconstructed into a scratch array first, because `appendFeature` traces
    // present-day coordinates and the whole point here is that these are not.
    for (const piece of HISTORY_COASTLINES) {
      const moved: number[] = [];
      for (let i = 0; i < piece.coords.length; i += 2) {
        this.reconstruction.transform(piece.coords[i] as number, piece.coords[i + 1] as number, piece.rotationSlot);
        moved.push(this.reconstruction.lon, this.reconstruction.lat);
      }
      context.beginPath();
      appendFeature(context, moved, "fill");
      context.fill();
      context.stroke();
    }
  }
}

export function createDeepTimeIcon(): ScreenIcon {
  return iconFrom(new PangaeaIconNode());
}
