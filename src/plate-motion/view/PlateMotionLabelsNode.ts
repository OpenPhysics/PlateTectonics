/**
 * PlateMotionLabelsNode.ts
 *
 * The text over the Plate Motion cross-section: which plate is which, the two empty drop
 * zones before anything has been placed, and the named features a boundary builds as it
 * runs — trench, ridge, volcanic arc, mountain belt.
 *
 * Naming the features is the point at which the picture becomes geology rather than a
 * moving diagram. A student who has watched a slab go down and seen the word "trench"
 * appear where the sea floor bends has learned what a trench is, in a way that a caption
 * on a static figure does not achieve.
 */

import { Multilink, type TReadOnlyProperty } from "scenerystack/axon";
import type { Bounds2 } from "scenerystack/dot";
import { Node, type NodeOptions, Rectangle, Text } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import type { SectionPlacement } from "../../common/view/SectionPlacement.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { PLATE_X_LIMIT_M } from "../../PlateTectonicsConstants.js";
import { boundaryGeometry } from "../model/PlateGeometry.js";
import type { PlateMotionModel } from "../model/PlateMotionModel.js";
import type { PlateType } from "../model/PlateType.js";

const PLATE_LABEL_FONT = new PhetFont({ size: 12, weight: "bold" });
const FEATURE_FONT = new PhetFont(11);
const DROP_FONT = new PhetFont(12);

export type PlateMotionLabelsNodeOptions = NodeOptions;

export class PlateMotionLabelsNode extends Node {
  private readonly model: PlateMotionModel;

  /** Named viewBounds, not bounds: Node.bounds is a property on the base class. */
  private readonly viewBounds: Bounds2;

  private placement: SectionPlacement;

  public constructor(
    model: PlateMotionModel,
    placement: SectionPlacement,
    viewBounds: Bounds2,
    providedOptions?: PlateMotionLabelsNodeOptions,
  ) {
    super(providedOptions);
    this.model = model;
    this.viewBounds = viewBounds;
    this.placement = placement;

    const rebuild = Multilink.multilinkAny(
      [
        model.showLabelsProperty,
        model.leftPlateTypeProperty,
        model.rightPlateTypeProperty,
        model.motionTypeProperty,
        model.behaviorProperty,
        model.timeMillionsOfYearsProperty,
      ],
      () => this.rebuild(),
    );

    this.disposeEmitter.addListener(() => rebuild.dispose());
  }

  /** Re-aims the labels, after a switch between the flat section and the block. */
  public setPlacement(placement: SectionPlacement): void {
    this.placement = placement;
    this.rebuild();
  }

  private rebuild(): void {
    this.removeAllChildren();

    const model = this.model;
    const strings = StringManager.getInstance();
    const motionStrings = strings.getPlateMotionStrings();
    const a11y = strings.getPlateMotionA11yStrings().controls;

    const left = model.leftPlateTypeProperty.value;
    const right = model.rightPlateTypeProperty.value;

    // ── Empty drop zones ──────────────────────────────────────────────────────
    // Always drawn while a side is empty, whether or not labels are switched on: they
    // are the instruction for what to do next, not an annotation on a picture.
    if (left === null) {
      this.addDropZone(-1, motionStrings.dropLeftStringProperty, a11y.leftDropZoneStringProperty);
    }
    if (right === null) {
      this.addDropZone(1, motionStrings.dropRightStringProperty, a11y.rightDropZoneStringProperty);
    }

    if (!model.showLabelsProperty.value) {
      return;
    }

    // ── Plate names ───────────────────────────────────────────────────────────
    const nameFor: Record<PlateType, typeof motionStrings.continentalStringProperty> = {
      continental: motionStrings.continentalStringProperty,
      youngOceanic: motionStrings.youngOceanicStringProperty,
      oldOceanic: motionStrings.oldOceanicStringProperty,
    };
    if (left) {
      this.addLabelAtViewY(nameFor[left], -520000, this.viewBounds.minY + 12, PLATE_LABEL_FONT);
    }
    if (right) {
      this.addLabelAtViewY(nameFor[right], 520000, this.viewBounds.minY + 12, PLATE_LABEL_FONT);
    }

    // ── Named features ────────────────────────────────────────────────────────
    if (!(left && right)) {
      return;
    }
    const behavior = model.behaviorProperty.value;
    const motion = model.motionTypeProperty.value;
    if (!(behavior && motion)) {
      return;
    }

    const geometry = boundaryGeometry(motion, left, right, model.timeMillionsOfYearsProperty.value);

    // Each of these is anchored to the feature it names in *model* coordinates, with only
    // the last nudge in pixels, so a label stays on its feature whichever view is showing
    // and whatever the block is stretched by.
    if (behavior === "subduction") {
      // The trench sits at the boundary; the arc is wherever the magma came up.
      this.addLabel(motionStrings.trenchStringProperty, 0, 0, -26, FEATURE_FONT);
      const arc = geometry.volcanoes[0];
      if (arc) {
        this.addLabel(motionStrings.arcStringProperty, arc.xM, arc.baseM + arc.heightM, -16, FEATURE_FONT);
      }
    } else if (behavior === "rifting") {
      this.addLabel(motionStrings.ridgeStringProperty, 0, 0, -26, FEATURE_FONT);
      if (geometry.hasNewCrust) {
        this.addLabel(
          motionStrings.newCrustLabelStringProperty,
          geometry.newCrustHalfWidthM * 0.6,
          -4000,
          14,
          FEATURE_FONT,
        );
      }
    } else {
      const peakM = Math.max(...geometry.left.crustTop.map((point) => point.y));
      this.addLabel(motionStrings.mountainsStringProperty, 0, peakM, -18, FEATURE_FONT);
    }
  }

  /** A dashed outline over one half of the play area, with an instruction inside it. */
  private addDropZone(sign: number, label: TReadOnlyProperty<string>, accessibleName: TReadOnlyProperty<string>): void {
    // Built from the four projected corners rather than from two ranges: on the block the
    // zone's edges are not axis-aligned, and the enclosing box is what a drop target
    // wants anyway.
    const placement = this.placement;
    const corners = [
      placement.modelToView(sign * 20000, 20000),
      placement.modelToView(sign * PLATE_X_LIMIT_M, 20000),
      placement.modelToView(sign * PLATE_X_LIMIT_M, -90000),
      placement.modelToView(sign * 20000, -90000),
    ];
    const inner = Math.min(...corners.map((point) => point.x));
    const outer = Math.max(...corners.map((point) => point.x));
    const top = Math.min(...corners.map((point) => point.y));
    const bottom = Math.max(...corners.map((point) => point.y));

    this.addChild(
      new Rectangle(Math.min(inner, outer), top, Math.abs(outer - inner), bottom - top, {
        stroke: PlateTectonicsColors.dropZoneColorProperty,
        lineWidth: 2,
        lineDash: [8, 6],
        cornerRadius: 4,
      }),
    );
    const text = new Text(label, {
      font: DROP_FONT,
      fill: PlateTectonicsColors.dropZoneColorProperty,
      maxWidth: Math.abs(outer - inner) - 24,
      centerX: (inner + outer) / 2,
      centerY: (top + bottom) / 2,
    });
    text.accessibleName = accessibleName;
    this.addChild(text);
  }

  /** One label on a model point, nudged by `offsetY` pixels to clear the feature. */
  private addLabel(
    text: TReadOnlyProperty<string>,
    xM: number,
    elevationM: number,
    offsetY: number,
    font: PhetFont,
  ): void {
    const anchor = this.placement.modelToView(xM, elevationM);
    this.addLabelAtViewY(text, xM, anchor.y + offsetY, font, anchor.x);
  }

  /**
   * One label centred on a model x at a fixed height in the viewport.
   *
   * For the two plate names, which belong to the picture as a whole rather than to any
   * feature in it and so are pinned to the top of the play area in both views.
   */
  private addLabelAtViewY(
    text: TReadOnlyProperty<string>,
    xM: number,
    viewY: number,
    font: PhetFont,
    centerX = this.placement.modelToView(xM, 0).x,
  ): void {
    this.addChild(
      new Text(text, {
        font,
        fill: PlateTectonicsColors.textColorProperty,
        centerX,
        centerY: viewY,
        maxWidth: 180,
      }),
    );
  }
}
