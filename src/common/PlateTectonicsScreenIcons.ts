/**
 * PlateTectonicsScreenIcons.ts
 *
 * The home-screen and navigation-bar icons, drawn on the standard PhET 548 × 373
 * canvas. One factory per screen, each showing the one picture that carries what that
 * screen is about: a subduction zone for the global map, three blocks floating at
 * three different heights for the Crust screen.
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
 * ocean floor between them. Divergent rather than convergent so it stays distinguishable
 * from createPlateTectonicsIcon(), which is already a subduction zone.
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
