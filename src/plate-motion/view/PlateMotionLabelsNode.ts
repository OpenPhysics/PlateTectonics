/**
 * PlateMotionLabelsNode.ts
 *
 * Everything named on the Plate Motion cross-section: the two drop zones before anything
 * has been placed, the structure of each plate once it has, the mantle they move through,
 * and the features a boundary builds as it runs — trench, ridge, volcanic arc, mountain
 * belt.
 *
 * Naming the features is the point at which the picture becomes geology rather than a
 * moving diagram. A student who has watched a slab go down and seen the word "trench"
 * appear where the sea floor bends has learned what a trench is, in a way that a caption
 * on a static figure does not achieve.
 *
 * ── Why each plate gets two extents and not one name ──────────────────────────
 * A plate is not its crust. The thing that subducts, the thing that is rigid, the thing
 * whose base the slab descends from, is the *lithosphere* — crust plus the cold mantle
 * welded to it, five to ten times thicker than the crust itself. The screen used to pin a
 * plate's name to the top of the viewport, which named the crust and left the lithosphere
 * unnamed, so the one distinction the whole screen turns on was invisible.
 *
 * So each plate carries two {@link RangeLabelNode}s, as PhET's did: one spanning its crust
 * and one spanning crust top to lithosphere base. Their ranges *overlap* — the second
 * contains the first — which is exactly why they sit at different model x. PhET staggered
 * them at ⅙ and ⅓ of the way out from the boundary and that is kept.
 *
 * ── And a dotted line along the base of each plate ────────────────────────────
 * The lithosphere and the asthenosphere under it are the same rock at different
 * temperatures, so in density mode the plate's base is a 3% step that all but disappears.
 * {@link BoundaryLineNode} draws it, and at a subduction zone the overriding plate's line
 * stops where the slab has passed beneath it.
 */

import { Multilink, type TReadOnlyProperty } from "scenerystack/axon";
import { Bounds2, Vector2 } from "scenerystack/dot";
import { FireListener, Node, type NodeOptions, Rectangle, Text } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { BoundaryLineNode } from "../../common/view/BoundaryLineNode.js";
import { RangeLabelNode } from "../../common/view/RangeLabelNode.js";
import type { SectionPlacement } from "../../common/view/SectionPlacement.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { PLATE_X_LIMIT_M } from "../../PlateTectonicsConstants.js";
import type { Side } from "../model/BoundaryRules.js";
import { type BoundaryGeometry, boundaryGeometry, elevationAtX, restingGeometry } from "../model/PlateGeometry.js";
import type { PlateMotionModel } from "../model/PlateMotionModel.js";
import type { PlateType } from "../model/PlateType.js";

const FEATURE_FONT = new PhetFont(11);
const EXTENT_FONT = new PhetFont(11);
const DROP_FONT = new PhetFont(12);

/**
 * The extent of a drop zone, in model coordinates.
 *
 * It stops short of the boundary rather than meeting it: the seam belongs to neither side,
 * and a target that ran up to x = 0 would make the side a drop landed on depend on a pixel.
 * Down to −90 km, which is below the deepest lithosphere any pairing starts with, so the
 * zone encloses the whole plate it stands for and not just its crust.
 */
const ZONE_INNER_XM = 20000;
const ZONE_TOP_M = 20000;
const ZONE_BOTTOM_M = -90000;

/** Where each plate's two extent bars sit, as a fraction of the half-width from the boundary. */
const CRUST_LABEL_X_FRACTION = 1 / 6;
const LITHOSPHERE_LABEL_X_FRACTION = 1 / 3;

/**
 * Elevation the "Mantle" label sits at before anything has deformed the plates, m.
 *
 * PhET's −180 km: below the deepest lithosphere any pairing starts with, and above the
 * bottom of the section, so it names open asthenosphere rather than the inside of a plate.
 */
const MANTLE_LABEL_M = -180000;

/**
 * How far below the boundary's lithosphere base the mantle label rides during a collision.
 *
 * PhET tracked the sinking root and kept the label a fixed distance under it, which is
 * what stops the word "Mantle" ending up inside the root as it deepens. The distance is
 * whatever the gap was at the start, so nothing jumps when a collision begins.
 */
const MANTLE_LABEL_BELOW_ROOT_M = MANTLE_LABEL_M - (-40000 - 70000);

/**
 * Furthest from the boundary the overriding plate's dotted line may be cut, m.
 *
 * PhET's `maxXBoundaryCutoff`. Without the clamp a slab that has travelled a long way
 * would push the cutoff right across the plate and the line would vanish; with it, the
 * line always says where the plate's base is over most of its length and stops only over
 * the part the slab is actually under.
 */
const BOUNDARY_CUTOFF_LIMIT_M = 55000;

/**
 * Where one drop zone sits in the picture that is currently showing, view coordinates.
 *
 * Built from the four projected corners rather than from two ranges: on the block the
 * zone's edges are not axis-aligned, and the enclosing box is what a drop target wants
 * anyway. Pure, and unit-tested in tests/PlateMotionLabelsNode.test.ts — a drag from the
 * chooser lands on the side this function says it does, so "the left half of the section is
 * the left plate" has to hold in both views and at any exaggeration.
 */
export function dropZoneBounds(placement: SectionPlacement, side: Side): Bounds2 {
  const sign = side === "left" ? -1 : 1;
  const corners = [
    placement.modelToView(sign * ZONE_INNER_XM, ZONE_TOP_M),
    placement.modelToView(sign * PLATE_X_LIMIT_M, ZONE_TOP_M),
    placement.modelToView(sign * PLATE_X_LIMIT_M, ZONE_BOTTOM_M),
    placement.modelToView(sign * ZONE_INNER_XM, ZONE_BOTTOM_M),
  ];
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  return new Bounds2(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
}

export type PlateMotionLabelsNodeOptions = NodeOptions;

export class PlateMotionLabelsNode extends Node {
  private readonly model: PlateMotionModel;

  /** Named viewBounds, not bounds: Node.bounds is a property on the base class. */
  private readonly viewBounds: Bounds2;

  private placement: SectionPlacement;

  /**
   * The two drop zones, left then right, in the order the screen should put them in its
   * `pdomOrder`.
   *
   * Built once and re-dressed on every rebuild rather than rebuilt with everything else.
   * A zone carries a `FireListener` and a PDOM identity, and both of those want to outlive
   * a repaint: throwing them away sixty times a second would leak the listeners and would
   * drop keyboard focus out of the zone the moment the picture changed under it.
   */
  public readonly zones: readonly Node[];

  /** The two zones' geometry, rebuilt in place — see {@link zones}. */
  private readonly zoneVisuals: readonly Node[];

  /**
   * Where each zone currently is, in this node's coordinate frame, or null while it is not
   * a target. Kept so a drag can be told which side it is over without the chooser having
   * to know how a zone is projected.
   */
  private readonly zoneBounds: [Bounds2 | null, Bounds2 | null] = [null, null];

  /** The zone a dragged piece is currently over, which is drawn as the one it would go to. */
  private hoveredSide: Side | null = null;

  /** Everything else this node draws, rebuilt wholesale. */
  private readonly contentLayer = new Node();

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

    const strings = StringManager.getInstance();
    const a11y = strings.getPlateMotionA11yStrings().controls;

    const zones: Node[] = [];
    const zoneVisuals: Node[] = [];
    const listeners: FireListener[] = [];

    for (const side of ["left", "right"] as const) {
      const visuals = new Node();
      const zone = new Node({
        cursor: "pointer",
        children: [visuals],
        tagName: "button",
        accessibleName: side === "left" ? a11y.leftDropZoneStringProperty : a11y.rightDropZoneStringProperty,
        accessibleHelpText:
          side === "left" ? a11y.leftDropZoneHelpStringProperty : a11y.rightDropZoneHelpStringProperty,
      });
      const listener = new FireListener({ fire: () => model.activateZone(side) });
      zone.addInputListener(listener);
      listeners.push(listener);
      zones.push(zone);
      zoneVisuals.push(visuals);
      this.addChild(zone);
    }

    this.zones = zones;
    this.zoneVisuals = zoneVisuals;
    this.addChild(this.contentLayer);

    const rebuild = Multilink.multilinkAny(
      [
        model.showLabelsProperty,
        model.leftPlateTypeProperty,
        model.rightPlateTypeProperty,
        model.armedPlateTypeProperty,
        model.motionTypeProperty,
        model.behaviorProperty,
        model.timeMillionsOfYearsProperty,
      ],
      () => this.rebuild(),
    );

    this.disposeEmitter.addListener(() => {
      rebuild.dispose();
      for (const listener of listeners) {
        listener.dispose();
      }
    });
  }

  /**
   * Which drop zone is under a point in global coordinates, or null if neither is.
   *
   * What a piece dragged out of the crust chooser is dropped on. The chooser cannot work
   * this out for itself: a zone's position comes from the section's current projection,
   * which changes with the view and with the vertical exaggeration.
   */
  public sideAtGlobalPoint(globalPoint: Vector2): Side | null {
    const local = this.globalToLocalPoint(globalPoint);
    for (const side of ["left", "right"] as const) {
      const index = side === "left" ? 0 : 1;
      const bounds = this.zoneBounds[index];
      if (this.zones[index]?.visible && bounds?.containsPoint(local)) {
        return side;
      }
    }
    return null;
  }

  /**
   * Says which zone a piece is being carried over, so that zone can say it is the one the
   * piece would land in. Both zones already highlight while something is in hand; this is
   * what distinguishes "somewhere it could go" from "where it is going".
   */
  public setHoveredZone(side: Side | null): void {
    if (this.hoveredSide !== side) {
      this.hoveredSide = side;
      this.rebuild();
    }
  }

  /** Re-aims the labels, after a switch between the flat section and the block. */
  public setPlacement(placement: SectionPlacement): void {
    this.placement = placement;
    this.rebuild();
  }

  private rebuild(): void {
    this.contentLayer.removeAllChildren();

    const model = this.model;
    const strings = StringManager.getInstance();
    const motionStrings = strings.getPlateMotionStrings();

    const left = model.leftPlateTypeProperty.value;
    const right = model.rightPlateTypeProperty.value;

    // ── The two zones ─────────────────────────────────────────────────────────
    // Live while either side can still be changed, whether or not labels are switched
    // on: they are the instruction for what to do next and the target for doing it, not
    // an annotation on a picture. Once a motion is chosen the boundary is running and the
    // plates are settled, so they go.
    const zonesLive = !model.animationStartedProperty.value;
    if (!zonesLive) {
      this.hoveredSide = null;
    }
    this.zones.forEach((zone, index) => {
      zone.visible = zonesLive;
      if (zonesLive) {
        this.dressDropZone(
          index === 0 ? "left" : "right",
          index === 0 ? motionStrings.dropLeftStringProperty : motionStrings.dropRightStringProperty,
        );
      } else {
        // A zone that is not a target must not answer sideAtGlobalPoint, or a drag would
        // still land on a boundary that has already been set running.
        this.zoneBounds[index] = null;
      }
    });

    if (!model.showLabelsProperty.value) {
      return;
    }
    if (!(left && right)) {
      return;
    }

    // The shape being labelled is the shape being painted — the painters make the same
    // call, and a label built from a different instant would drift off its feature.
    const motion = model.motionTypeProperty.value;
    const geometry = motion
      ? boundaryGeometry(motion, left, right, model.timeMillionsOfYearsProperty.value)
      : restingGeometry(left, right);

    // ── The structure of each plate ───────────────────────────────────────────
    this.addPlateExtents("left", left, geometry);
    this.addPlateExtents("right", right, geometry);
    this.addLithosphereBaseLines(geometry);
    this.addMantleLabel(geometry);

    // ── Named features ────────────────────────────────────────────────────────
    const behavior = model.behaviorProperty.value;
    if (!(behavior && motion)) {
      return;
    }

    // Each of these is anchored to the feature it names in *model* coordinates, with only
    // the last nudge in pixels, so a label stays on its feature whichever view is showing
    // and whatever the block is stretched by.
    if (behavior === "subduction") {
      // The trench sits at the boundary; the arc is wherever the magma came up.
      this.addLabel(motionStrings.trenchStringProperty, 0, 0, -26);
      const arc = geometry.volcanoes[0];
      if (arc) {
        this.addLabel(motionStrings.arcStringProperty, arc.xM, arc.baseM + arc.heightM, -16);
      }
    } else if (behavior === "rifting") {
      this.addLabel(motionStrings.ridgeStringProperty, 0, 0, -26);
      if (geometry.hasNewCrust) {
        this.addLabel(motionStrings.newCrustLabelStringProperty, geometry.newCrustHalfWidthM * 0.6, -4000, 14);
      }
    } else {
      const peakM = Math.max(...geometry.left.crustTop.map((point) => point.y));
      this.addLabel(motionStrings.mountainsStringProperty, 0, peakM, -18);
    }
  }

  /**
   * One plate's crust and its lithosphere, each as a bar from its top to its bottom.
   *
   * Both start at the top of the crust — the lithosphere's top *is* the crust's top — so
   * they are put at different distances from the boundary, or the two bars would be drawn
   * one on top of the other with their names overlapping.
   */
  private addPlateExtents(side: Side, type: PlateType, geometry: BoundaryGeometry): void {
    const motion = StringManager.getInstance().getPlateMotionStrings();
    const section = StringManager.getInstance().getSectionStrings();
    const outline = side === "left" ? geometry.left : geometry.right;
    const sign = side === "left" ? -1 : 1;

    const crustName: Record<PlateType, TReadOnlyProperty<string>> = {
      continental: motion.continentalCrustLabelStringProperty,
      youngOceanic: motion.youngOceanicCrustLabelStringProperty,
      oldOceanic: motion.oldOceanicCrustLabelStringProperty,
    };

    const crustXM = sign * CRUST_LABEL_X_FRACTION * PLATE_X_LIMIT_M;
    this.contentLayer.addChild(
      new RangeLabelNode({
        placement: this.placement,
        topM: new Vector2(crustXM, elevationAtX(outline.crustTop, crustXM)),
        bottomM: new Vector2(crustXM, elevationAtX(outline.crustBase, crustXM)),
        label: crustName[type],
        viewBounds: this.viewBounds,
        font: EXTENT_FONT,
        maxTextWidth: 130,
      }),
    );

    const lithosphereXM = sign * LITHOSPHERE_LABEL_X_FRACTION * PLATE_X_LIMIT_M;
    this.contentLayer.addChild(
      new RangeLabelNode({
        placement: this.placement,
        topM: new Vector2(lithosphereXM, elevationAtX(outline.crustTop, lithosphereXM)),
        bottomM: new Vector2(lithosphereXM, elevationAtX(outline.lithosphereBase, lithosphereXM)),
        label: section.lithosphereStringProperty,
        viewBounds: this.viewBounds,
        font: EXTENT_FONT,
        maxTextWidth: 130,
      }),
    );
  }

  /**
   * The dotted line along the base of each plate, and the one joining them at the
   * boundary before anything has started.
   *
   * The joining line is PhET's `addJoinedBoundary`: two plates that have been dropped but
   * not yet set in motion are one continuous lithosphere with a seam, and drawing the two
   * bases as separate lines that stop short of each other would say the opposite.
   */
  private addLithosphereBaseLines(geometry: BoundaryGeometry): void {
    const model = this.model;
    const subducting = model.subductingSideProperty.value;

    for (const side of ["left", "right"] as const) {
      const outline = side === "left" ? geometry.left : geometry.right;
      const isOverriding = subducting !== null && subducting !== side;

      // The overriding plate's line stops where the slab has gone under it. Found from
      // where the slab centreline crosses this plate's own base, which is the depth at
      // which the slab stops being beside the plate and starts being beneath it.
      const cutoffM = isOverriding ? this.slabEntryXM(geometry, outline.lithosphereBase) : null;

      this.contentLayer.addChild(
        new BoundaryLineNode({
          placement: this.placement,
          points: outline.lithosphereBase,
          viewBounds: this.viewBounds,
          ...(side === "left"
            ? { minXM: -PLATE_X_LIMIT_M, maxXM: cutoffM ?? 0 }
            : { minXM: cutoffM ?? 0, maxXM: PLATE_X_LIMIT_M }),
        }),
      );
    }

    if (model.motionTypeProperty.value === null) {
      const leftBaseM = elevationAtX(geometry.left.lithosphereBase, 0);
      const rightBaseM = elevationAtX(geometry.right.lithosphereBase, 0);
      this.contentLayer.addChild(
        new BoundaryLineNode({
          placement: this.placement,
          points: [new Vector2(0, leftBaseM), new Vector2(0, rightBaseM)],
          viewBounds: this.viewBounds,
        }),
      );
    }
  }

  /**
   * Model x at which the slab has passed under a plate whose base is `base`.
   *
   * The first point on the slab's centreline that is below the plate's base at its own x.
   * Clamped to PhET's ±55 km so a long-run subduction cannot cut the line away entirely.
   */
  private slabEntryXM(geometry: BoundaryGeometry, base: readonly Vector2[]): number | null {
    for (const point of geometry.slab) {
      if (point.y < elevationAtX(base, point.x)) {
        return Math.sign(point.x) * Math.min(BOUNDARY_CUTOFF_LIMIT_M, Math.abs(point.x));
      }
    }
    return null;
  }

  /**
   * "Mantle", on the asthenosphere the plates are riding through.
   *
   * Fixed at −180 km, except in a collision: there the lithospheric root grows downwards
   * past it, and a label left in place would end up inside the plate it is contrasting
   * with. It rides the root down instead, at the distance it started above it.
   */
  private addMantleLabel(geometry: BoundaryGeometry): void {
    const section = StringManager.getInstance().getSectionStrings();

    let elevationM = MANTLE_LABEL_M;
    if (this.model.behaviorProperty.value === "collision") {
      elevationM = MANTLE_LABEL_BELOW_ROOT_M + elevationAtX(geometry.left.lithosphereBase, 0);
    }

    this.addLabel(section.mantleStringProperty, 0, elevationM, 0);
  }

  /**
   * A zone over one half of the play area: an outline, an instruction, and a target.
   *
   * Activating it places whatever crust the user has picked up, or clears whatever is
   * already there. That is what makes the zones the thing the chooser hands a piece *to*,
   * rather than a picture of where pieces end up — and it is the same target however the
   * piece arrives: pressed into place from the keyboard, or dragged in with a pointer and
   * released over it.
   */
  private dressDropZone(side: Side, label: TReadOnlyProperty<string>): void {
    const index = side === "left" ? 0 : 1;
    const zone = this.zones[index];
    const visuals = this.zoneVisuals[index];
    if (!(zone && visuals)) {
      return;
    }
    visuals.removeAllChildren();

    const zoneBounds = dropZoneBounds(this.placement, side);
    this.zoneBounds[index] = zoneBounds;

    const empty = this.model.plateAt(side) === null;

    // Highlighted while a piece is in hand, which is PhET's BoxHighlightNode: the user has
    // committed to placing something, and the two things they can place it on say so.
    const armed = this.model.armedPlateTypeProperty.value !== null;
    const color = armed ? PlateTectonicsColors.dropZoneActiveColorProperty : PlateTectonicsColors.dropZoneColorProperty;

    // The whole rectangle is the target, not just its dashed edge — a target the width of
    // a stroke is one no pointer finds. Set as an area rather than as a transparent fill
    // so it does not depend on how Scenery hit-tests a fill nobody can see.
    zone.mouseArea = zoneBounds;
    zone.touchArea = zoneBounds;

    // Deeper under the piece being carried: both zones say "something could go here", and
    // the one the pointer is over says "this is where it will go" — which is the whole of
    // the feedback a drag needs, since the piece itself is under the pointer already.
    const hovered = this.hoveredSide === side;

    if (armed) {
      // A wash rather than only a border colour change, so the highlight is visible in
      // peripheral vision while the pointer is somewhere else entirely.
      visuals.addChild(new Rectangle(zoneBounds, { fill: color, opacity: hovered ? 0.3 : 0.14, cornerRadius: 4 }));
    }

    // The outline is drawn while the side is still waiting for something, or while a
    // piece is in hand and this side is somewhere it could go. A settled side keeps an
    // invisible target so it can still be cleared, which is what the crust chooser has
    // always claimed and what a keyboard user otherwise has no way to do.
    if (empty || armed) {
      visuals.addChild(
        new Rectangle(zoneBounds, {
          stroke: color,
          lineWidth: hovered ? 4 : armed ? 3 : 2,
          lineDash: [8, 6],
          cornerRadius: 4,
        }),
      );
    }

    if (empty) {
      visuals.addChild(
        new Text(label, {
          font: DROP_FONT,
          fill: color,
          maxWidth: zoneBounds.width - 24,
          centerX: zoneBounds.centerX,
          centerY: zoneBounds.centerY,
        }),
      );
    }
  }

  /** One label on a model point, nudged by `offsetY` pixels to clear the feature. */
  private addLabel(text: TReadOnlyProperty<string>, xM: number, elevationM: number, offsetY: number): void {
    const anchor = this.placement.modelToView(xM, elevationM);
    this.contentLayer.addChild(
      new Text(text, {
        font: FEATURE_FONT,
        fill: PlateTectonicsColors.textColorProperty,
        centerX: anchor.x,
        centerY: anchor.y + offsetY,
        maxWidth: 180,
      }),
    );
  }
}
