/**
 * LegendSwatches.ts
 *
 * Small icons that stand for a data layer or a map symbol, drawn with the same
 * colours the map uses. They appear both beside the layer checkboxes and in the
 * legend strip below the map, so a symbol always means the same thing wherever the
 * user meets it.
 */

import { Shape } from "scenerystack/kite";
import { Circle, Line, LinearGradient, Node, Path, Rectangle } from "scenerystack/scenery";
import { ArrowNode } from "scenerystack/scenery-phet";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";

/** Every symbol the legend and the layer checkboxes can show. */
export type SwatchKind =
  | "plates"
  | "boundaries"
  | "divergent"
  | "convergent"
  | "transform"
  | "motion"
  | "earthquakes"
  | "allDepths"
  | "shallow"
  | "intermediate"
  | "deep"
  | "volcanoes"
  | "volcano"
  | "hotspot"
  | "topography"
  | "seafloorAge";

const SWATCH_WIDTH = 18;
const SWATCH_HEIGHT = 12;

/** Opacity of the plate-palette blocks in the "tectonic plates" swatch. */
const PLATE_SWATCH_OPACITY = 0.75;

/**
 * Where each {@link PlateTectonicsColors.reliefRampColorProperties} stop sits along
 * the topography swatch; one ratio per color, in the same order.
 */
const RELIEF_RAMP_STOPS = [0, 0.45, 0.6, 0.85, 1];

/** Builds the icon for one symbol, centred on its own origin-free bounds. */
export function createLegendSwatch(kind: SwatchKind): Node {
  switch (kind) {
    case "plates":
      // Three neighbouring palette colours meeting at outlined edges — the colour
      // wash that tells one plate from the next.
      return new Node({
        children: [0, 1, 2].map((index) => plateBlock(index, (index * SWATCH_WIDTH) / 3)),
      });

    case "boundaries":
      // All three boundary colours stacked, since the layer draws all three.
      return new Node({
        children: [
          boundaryLine(PlateTectonicsColors.divergentBoundaryColorProperty, 0),
          boundaryLine(PlateTectonicsColors.convergentBoundaryColorProperty, 4.5),
          boundaryLine(PlateTectonicsColors.transformBoundaryColorProperty, 9),
        ],
      });

    case "divergent":
      return boundaryLine(PlateTectonicsColors.divergentBoundaryColorProperty, 0);
    case "convergent":
      return boundaryLine(PlateTectonicsColors.convergentBoundaryColorProperty, 0);
    case "transform":
      return boundaryLine(PlateTectonicsColors.transformBoundaryColorProperty, 0);

    case "motion":
      return new ArrowNode(0, 0, SWATCH_WIDTH, 0, {
        fill: PlateTectonicsColors.velocityVectorColorProperty,
        stroke: null,
        headHeight: 6,
        headWidth: 7,
        tailWidth: 2,
      });

    case "earthquakes":
      return new Node({
        children: [
          quakeDot(PlateTectonicsColors.shallowQuakeColorProperty, 0, 3.2),
          quakeDot(PlateTectonicsColors.intermediateQuakeColorProperty, 8, 2.6),
          quakeDot(PlateTectonicsColors.deepQuakeColorProperty, 15, 2),
        ],
      });

    case "allDepths":
      return new Node({
        children: [
          quakeDot(PlateTectonicsColors.shallowQuakeColorProperty, 0, 2.8),
          quakeDot(PlateTectonicsColors.intermediateQuakeColorProperty, 6.5, 2.8),
          quakeDot(PlateTectonicsColors.deepQuakeColorProperty, 13, 2.8),
        ],
      });

    case "shallow":
      return quakeDot(PlateTectonicsColors.shallowQuakeColorProperty, 0, 3.4);
    case "intermediate":
      return quakeDot(PlateTectonicsColors.intermediateQuakeColorProperty, 0, 3.4);
    case "deep":
      return quakeDot(PlateTectonicsColors.deepQuakeColorProperty, 0, 3.4);

    case "volcanoes":
      return new Node({ children: [volcanoTriangle(0), hotspotDiamond(11)] });
    case "volcano":
      return volcanoTriangle(0);
    case "hotspot":
      return hotspotDiamond(0);

    case "topography":
      // A slice of the relief ramp: deep ocean through shelf to high ground. The
      // stops are bunched past the middle because most of the Earth's surface is
      // below sea level, so an evenly spaced ramp would read as almost all ocean.
      return new Rectangle(0, 0, SWATCH_WIDTH, SWATCH_HEIGHT, {
        fill: PlateTectonicsColors.reliefRampColorProperties.reduce(
          (gradient, color, index) => gradient.addColorStop(RELIEF_RAMP_STOPS[index] as number, color),
          new LinearGradient(0, 0, SWATCH_WIDTH, 0),
        ),
        cornerRadius: 2,
      });

    case "seafloorAge":
      // The age ramp itself, young at the left and old at the right — the layer draws
      // a line rather than a block, but what it is saying is which end of this bar
      // each line sits at.
      return new Rectangle(0, 0, SWATCH_WIDTH, SWATCH_HEIGHT, {
        fill: PlateTectonicsColors.seafloorAgeRampColorProperties.reduce(
          (gradient, color, index, stops) => gradient.addColorStop(index / (stops.length - 1), color),
          new LinearGradient(0, 0, SWATCH_WIDTH, 0),
        ),
        cornerRadius: 2,
      });

    default:
      return new Node();
  }
}

/**
 * One plate of the sample wash. On the map the palette is drawn at
 * `PLATE_FILL_OPACITY` so the relief shows through; here it is drawn more solidly,
 * because at eighteen pixels wide over a flat panel that faint a wash would read as
 * no colour at all.
 */
function plateBlock(paletteIndex: number, x: number): Node {
  const palette = PlateTectonicsColors.platePaletteColorProperties;
  return new Rectangle(x, 0, SWATCH_WIDTH / 3, SWATCH_HEIGHT, {
    fill: palette[paletteIndex % palette.length] as (typeof palette)[number],
    opacity: PLATE_SWATCH_OPACITY,
    stroke: PlateTectonicsColors.plateOutlineColorProperty,
    lineWidth: 0.7,
  });
}

function boundaryLine(color: (typeof PlateTectonicsColors)["divergentBoundaryColorProperty"], y: number): Node {
  return new Line(0, y, SWATCH_WIDTH, y, { stroke: color, lineWidth: 3, lineCap: "round" });
}

function quakeDot(color: (typeof PlateTectonicsColors)["shallowQuakeColorProperty"], x: number, radius: number): Node {
  return new Circle(radius, { fill: color, centerX: x + radius, centerY: SWATCH_HEIGHT / 2 });
}

function volcanoTriangle(x: number): Node {
  const size = 5;
  return new Path(
    new Shape()
      .moveTo(x + size, 1)
      .lineTo(x + 2 * size, SWATCH_HEIGHT - 1)
      .lineTo(x, SWATCH_HEIGHT - 1)
      .close(),
    { fill: PlateTectonicsColors.volcanoColorProperty },
  );
}

function hotspotDiamond(x: number): Node {
  const size = 4.5;
  const centerY = SWATCH_HEIGHT / 2;
  return new Path(
    new Shape()
      .moveTo(x + size, centerY - size)
      .lineTo(x + 2 * size, centerY)
      .lineTo(x + size, centerY + size)
      .lineTo(x, centerY)
      .close(),
    { fill: PlateTectonicsColors.hotspotColorProperty },
  );
}
