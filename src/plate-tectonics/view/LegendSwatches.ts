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
  | "topography";

const SWATCH_WIDTH = 18;
const SWATCH_HEIGHT = 12;

/** Builds the icon for one symbol, centred on its own origin-free bounds. */
export function createLegendSwatch(kind: SwatchKind): Node {
  switch (kind) {
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
      // A slice of the relief ramp: deep ocean through shelf to high ground.
      return new Rectangle(0, 0, SWATCH_WIDTH, SWATCH_HEIGHT, {
        fill: new LinearGradient(0, 0, SWATCH_WIDTH, 0)
          .addColorStop(0, "#0d2a5c")
          .addColorStop(0.45, "#3c7fbe")
          .addColorStop(0.6, "#5a8256")
          .addColorStop(0.85, "#b08a5c")
          .addColorStop(1, "#efefef"),
        cornerRadius: 2,
      });

    default:
      return new Node();
  }
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
