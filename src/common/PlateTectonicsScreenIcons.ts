/**
 * PlateTectonicsScreenIcons.ts
 *
 * The home-screen and navigation-bar icon, drawn on the standard PhET 548 × 373
 * canvas: a subduction zone in cross-section, which is the one picture that carries
 * the whole idea — an oceanic plate diving beneath a continent, a trench where it
 * bends down, and a volcano above where it begins to melt.
 */
import { Shape } from "scenerystack/kite";
import { Node, Path, Rectangle } from "scenerystack/scenery";
import { ScreenIcon } from "scenerystack/sim";
import PlateTectonicsColors from "../PlateTectonicsColors.js";

const W = 548;
const H = 373;

/** Where the sea floor meets the continental margin, in icon coordinates. */
const TRENCH_X = 196;

/** View y of the plate surface. */
const SURFACE_Y = 150;

type ColorProperty = (typeof PlateTectonicsColors)["mantleColorProperty"];

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

export function createPlateTectonicsIcon(): ScreenIcon {
  const children: Node[] = [
    new Rectangle(0, 0, W, H, { fill: PlateTectonicsColors.skyColorProperty }),
    new Rectangle(0, SURFACE_Y, W, H - SURFACE_Y, { fill: PlateTectonicsColors.mantleColorProperty }),
    new Rectangle(0, SURFACE_Y, W, 110, { fill: PlateTectonicsColors.asthenosphereColorProperty }),

    // The descending slab, dipping to the right at about 45°.
    polygon(
      [
        [TRENCH_X - 60, SURFACE_Y - 26],
        [TRENCH_X + 10, SURFACE_Y - 26],
        [W - 60, H],
        [W - 150, H],
      ],
      PlateTectonicsColors.lithosphereColorProperty,
    ),

    new Rectangle(0, SURFACE_Y - 74, TRENCH_X + 20, 48, { fill: PlateTectonicsColors.seaWaterColorProperty }),
    new Rectangle(0, SURFACE_Y - 26, TRENCH_X, 26, { fill: PlateTectonicsColors.oceanicCrustColorProperty }),
    new Rectangle(TRENCH_X + 20, SURFACE_Y - 26, W - TRENCH_X - 20, 70, {
      fill: PlateTectonicsColors.continentalCrustColorProperty,
    }),

    // Magma rising from the slab into an arc volcano.
    polygon(
      [
        [330, SURFACE_Y - 26],
        [352, SURFACE_Y - 26],
        [372, SURFACE_Y + 96],
        [312, SURFACE_Y + 96],
      ],
      PlateTectonicsColors.magmaColorProperty,
    ),
    polygon(
      [
        [341, SURFACE_Y - 96],
        [386, SURFACE_Y - 26],
        [296, SURFACE_Y - 26],
      ],
      PlateTectonicsColors.volcanoColorProperty,
    ),
  ];

  return iconFrom(new Node({ children }));
}
