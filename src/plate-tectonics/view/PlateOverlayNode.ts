/**
 * PlateOverlayNode.ts
 *
 * The vector layer that sits on top of the map canvas: one label and one motion
 * arrow per major plate.
 *
 * These are ordinary Scenery Nodes rather than canvas painting, because there are
 * only about sixteen of them and they need crisp text at any zoom. Each arrow is
 * the plate's absolute velocity at the label point, computed from the plate's Euler
 * pole — so the Nazca plate's arrow is long and points east while the Antarctic
 * plate's is a stub, which is exactly the point.
 *
 * Both label and arrow ride the plate: when the reconstruction clock runs, the
 * anchor point is rotated about the plate's pole like everything else.
 */

import { Multilink } from "scenerystack/axon";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { Node, type NodeOptions, Text } from "scenerystack/scenery";
import { ArrowNode, PhetFont } from "scenerystack/scenery-phet";
import { PLATES } from "../../common/data/generated/plateData.js";
import type { MapProjection } from "../../common/MapProjection.js";
import { PlateReconstruction } from "../../common/PlateReconstruction.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { VELOCITY_VECTOR_SCALE } from "../../PlateTectonicsConstants.js";
import type { PlateTectonicsModel } from "../model/PlateTectonicsModel.js";

/** Speed (mm/year) the vector scale is defined against. */
const REFERENCE_SPEED_MM_PER_YEAR = 100;

/** Plates slower than this get a dot rather than an arrow, since the arrow head would swamp it. */
const MIN_DRAWN_SPEED_MM_PER_YEAR = 3;

const DEG_TO_RAD = Math.PI / 180;

export type PlateOverlayNodeOptions = NodeOptions;

/** One plate's label plus motion arrow and speed readout. */
interface PlateMarker {
  readonly plateIndex: number;
  readonly label: Node;
  readonly arrow: ArrowNode;
  readonly speedLabel: Node;
}

export class PlateOverlayNode extends Node {
  private readonly projection: MapProjection;
  private readonly reconstruction = new PlateReconstruction();
  private readonly markers: PlateMarker[] = [];

  public constructor(model: PlateTectonicsModel, projection: MapProjection, providedOptions?: PlateOverlayNodeOptions) {
    const options = optionize<PlateOverlayNodeOptions, EmptySelfOptions, NodeOptions>()({}, providedOptions);
    super(options);
    this.projection = projection;

    const labelLayer = new Node();
    const arrowLayer = new Node();
    this.addChild(arrowLayer);
    this.addChild(labelLayer);

    for (let index = 0; index < PLATES.length; index++) {
      const plate = PLATES[index] as (typeof PLATES)[number];
      if (!plate.major) {
        continue;
      }

      const velocity = PlateReconstruction.velocityAt(index, plate.labelLon, plate.labelLat);
      const label = createHaloText(plate.name, 11, true);
      const speedLabel = createHaloText(`${Math.round(velocity.speedMmPerYear)} mm/yr`, 9, false);
      const arrow = new ArrowNode(0, 0, 0, 0, {
        fill: PlateTectonicsColors.velocityVectorColorProperty,
        stroke: PlateTectonicsColors.labelHaloColorProperty,
        lineWidth: 0.5,
        headHeight: 8,
        headWidth: 8,
        tailWidth: 2.5,
      });

      labelLayer.addChild(label);
      arrowLayer.addChild(arrow);
      arrowLayer.addChild(speedLabel);
      this.markers.push({ plateIndex: index, label, arrow, speedLabel });
    }

    // The arrows and their readouts are one layer the user can switch off; the
    // plate names stay, because they are how the plates are identified at all.
    model.showVectorsProperty.link((visible: boolean) => {
      arrowLayer.visible = visible;
    });

    Multilink.multilink([model.timeMillionsOfYearsProperty], (time: number) => this.updatePositions(time));
  }

  /** Moves every label and arrow to where its plate is at `timeMyr`. */
  private updatePositions(timeMyr: number): void {
    this.reconstruction.setTime(timeMyr);

    for (const marker of this.markers) {
      const plate = PLATES[marker.plateIndex] as (typeof PLATES)[number];
      this.reconstruction.transform(plate.labelLon, plate.labelLat, marker.plateIndex);
      const x = this.projection.viewX(this.reconstruction.lon);
      const y = this.projection.viewY(this.reconstruction.lat);

      marker.label.centerX = x;
      marker.label.centerY = y - 9;

      // Velocity is a property of the plate, not of the epoch: the same rigid
      // rotation carries the point, so the arrow keeps its length and simply
      // turns with the plate.
      const velocity = PlateReconstruction.velocityAt(
        marker.plateIndex,
        this.reconstruction.lon,
        this.reconstruction.lat,
      );
      const length = (velocity.speedMmPerYear / REFERENCE_SPEED_MM_PER_YEAR) * VELOCITY_VECTOR_SCALE;
      const angle = velocity.azimuthDeg * DEG_TO_RAD;
      const tipX = x + length * Math.sin(angle);
      const tipY = y - length * Math.cos(angle);

      const drawArrow = velocity.speedMmPerYear >= MIN_DRAWN_SPEED_MM_PER_YEAR;
      marker.arrow.visible = drawArrow;
      if (drawArrow) {
        marker.arrow.setTailAndTip(x, y, tipX, tipY);
      }
      // The speed sits under the plate name, clear of the arrow whichever way it points.
      marker.speedLabel.centerX = x;
      marker.speedLabel.centerY = y + 9;
    }
  }
}

/**
 * Text with a heavy stroke of the halo colour drawn behind it, so plate names stay
 * readable over both dark ocean and pale continents in the relief raster.
 */
function createHaloText(text: string, size: number, bold: boolean): Node {
  const font = new PhetFont({ size, weight: bold ? "bold" : "normal" });
  const halo = new Text(text, {
    font,
    stroke: PlateTectonicsColors.labelHaloColorProperty,
    lineWidth: 3,
    opacity: 0.75,
  });
  const front = new Text(text, {
    font,
    fill: bold ? PlateTectonicsColors.plateLabelColorProperty : PlateTectonicsColors.velocityVectorColorProperty,
  });
  return new Node({ children: [halo, front] });
}
