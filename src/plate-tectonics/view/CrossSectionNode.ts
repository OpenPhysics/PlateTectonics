/**
 * CrossSectionNode.ts
 *
 * A boundary cross-section: the painted section (CrossSectionCanvasNode) plus the
 * localized labels and axes that go with it.
 *
 * Labels are Scenery Text rather than canvas text so they follow the locale and the
 * colour profile like every other piece of UI, and so a screen reader can reach
 * them. Their positions come from the same geometry the painter uses, so the
 * "Trench" label sits exactly where the trench was measured to be.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import { DerivedStringProperty, PatternStringProperty } from "scenerystack/axon";
import type { Bounds2 } from "scenerystack/dot";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { Line, Node, type NodeOptions, Rectangle, Text } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { CROSS_SECTIONS } from "../../common/data/generated/crossSectionData.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import type { PlateTectonicsModel } from "../model/PlateTectonicsModel.js";
import { CrossSectionCanvasNode } from "./CrossSectionCanvasNode.js";
import { CrossSectionGeometry } from "./CrossSectionGeometry.js";

const LABEL_FONT = new PhetFont({ size: 11, weight: "bold" });
const AXIS_FONT = new PhetFont(10);
const NOTE_FONT = new PhetFont(10);

/** Boundary labels closer together than this are stacked instead of overlapping. */
const LABEL_COLLISION_PX = 96;

/** How many rows the stack uses before wrapping back to the top. */
const LABEL_ROWS = 2;

/** Candidate depth-tick spacings, km — the smallest that gives at most six ticks wins. */
const DEPTH_TICK_STEPS_KM = [5, 10, 20, 25, 50, 100, 200];

export type CrossSectionNodeOptions = NodeOptions;

export class CrossSectionNode extends Node {
  private readonly model: PlateTectonicsModel;
  private readonly viewBounds: Bounds2;
  private readonly canvas: CrossSectionCanvasNode;
  private readonly annotationLayer = new Node();

  public constructor(model: PlateTectonicsModel, viewBounds: Bounds2, providedOptions?: CrossSectionNodeOptions) {
    const options = optionize<CrossSectionNodeOptions, EmptySelfOptions, NodeOptions>()({}, providedOptions);
    super(options);
    this.model = model;
    this.viewBounds = viewBounds;

    const initial = new CrossSectionGeometry(CROSS_SECTIONS[0] as (typeof CROSS_SECTIONS)[number], viewBounds);
    this.canvas = new CrossSectionCanvasNode(model, initial);
    this.addChild(this.canvas);
    this.addChild(this.annotationLayer);

    model.selectedViewProperty.link(() => this.updateSection());
  }

  /** Rebuilds the section for whichever cross-section the user has selected. */
  private updateSection(): void {
    const key = this.model.selectedViewProperty.value;
    if (key === "global") {
      return;
    }
    const data = CROSS_SECTIONS.find((section) => section.key === key);
    if (!data) {
      return;
    }

    this.canvas.setSection(data);
    const geometry = new CrossSectionGeometry(data, this.viewBounds);
    this.annotationLayer.removeAllChildren();
    this.annotationLayer.addChild(this.createAnnotations(geometry));
  }

  /** Axes, gridlines, feature labels and the vertical-exaggeration note. */
  private createAnnotations(geometry: CrossSectionGeometry): Node {
    const strings = StringManager.getInstance().getSectionStrings();
    const children: Node[] = [];

    const label = (text: TReadOnlyProperty<string> | string, x: number, y: number, font = LABEL_FONT): Node => {
      const halo = new Text(text, {
        font,
        stroke: PlateTectonicsColors.labelHaloColorProperty,
        lineWidth: 3.5,
        opacity: 0.8,
      });
      const front = new Text(text, { font, fill: PlateTectonicsColors.plateLabelColorProperty });
      const node = new Node({ children: [halo, front] });
      node.centerX = x;
      node.centerY = y;
      return node;
    };

    // ── Sea level and depth gridlines ─────────────────────────────────────────
    children.push(
      new Line(this.viewBounds.minX, geometry.seaLevelY, this.viewBounds.maxX, geometry.seaLevelY, {
        stroke: PlateTectonicsColors.mapFrameColorProperty,
        lineWidth: 0.8,
        lineDash: [4, 4],
      }),
    );
    const seaLevelLabelY =
      geometry.seaLevelY - this.viewBounds.minY < 16 ? geometry.seaLevelY + 9 : geometry.seaLevelY - 8;
    children.push(label(strings.seaLevelStringProperty, this.viewBounds.minX + 36, seaLevelLabelY, AXIS_FONT));

    // The divider between the two vertical scales: relief above, depth below.
    children.push(
      new Line(this.viewBounds.minX, geometry.surfaceY, this.viewBounds.maxX, geometry.surfaceY, {
        stroke: PlateTectonicsColors.mapFrameColorProperty,
        lineWidth: 1.2,
      }),
    );
    children.push(label("0", this.viewBounds.minX + 16, geometry.surfaceY - 8, AXIS_FONT));

    const tickStepKm =
      DEPTH_TICK_STEPS_KM.find((step) => geometry.data.maxDepthKm / step <= 6) ??
      (DEPTH_TICK_STEPS_KM[DEPTH_TICK_STEPS_KM.length - 1] as number);
    for (let depthKm = tickStepKm; depthKm <= geometry.data.maxDepthKm; depthKm += tickStepKm) {
      const y = geometry.y(depthKm);
      children.push(
        new Line(this.viewBounds.minX, y, this.viewBounds.maxX, y, {
          stroke: PlateTectonicsColors.mapFrameColorProperty,
          lineWidth: 0.5,
          opacity: 0.5,
        }),
      );
      children.push(label(`${Math.round(depthKm)}`, this.viewBounds.minX + 16, y - 7, AXIS_FONT));
    }
    children.push(
      label(strings.depthAxisStringProperty, this.viewBounds.minX + 34, this.viewBounds.maxY - 10, AXIS_FONT),
    );

    // ── Earth layers ──────────────────────────────────────────────────────────
    const layerLabelX = this.viewBounds.maxX - 70;
    children.push(
      label(strings.lithosphereStringProperty, layerLabelX, geometry.y(geometry.lithosphereBaseKm * 0.72), AXIS_FONT),
    );
    if (geometry.asthenosphereBaseKm > geometry.lithosphereBaseKm * 1.4) {
      children.push(
        label(
          strings.asthenosphereStringProperty,
          layerLabelX,
          geometry.y((geometry.lithosphereBaseKm + geometry.asthenosphereBaseKm) / 2),
          AXIS_FONT,
        ),
      );
    }
    if (geometry.data.maxDepthKm > geometry.asthenosphereBaseKm * 1.3) {
      children.push(
        label(
          strings.mantleStringProperty,
          layerLabelX,
          geometry.y((geometry.asthenosphereBaseKm + geometry.data.maxDepthKm) / 2),
          AXIS_FONT,
        ),
      );
    }

    // Crust labels sit inside the crust they name, over the stretch of profile that
    // is made of it. Where the crust is only a few pixels thick — a 700 km section
    // makes 35 km of crust very thin — the label is nudged clear of the divider.
    const crustLabelY = (distanceKm: number): number =>
      Math.max(geometry.surfaceY + 13, geometry.y(geometry.crustThicknessKm(distanceKm) * 0.55));

    const oceanicX = this.findCrustLabelX(geometry, true);
    if (oceanicX !== null) {
      children.push(
        label(
          strings.oceanicCrustStringProperty,
          oceanicX,
          crustLabelY(this.distanceAt(geometry, oceanicX)),
          AXIS_FONT,
        ),
      );
    }
    const continentalX = this.findCrustLabelX(geometry, false);
    if (continentalX !== null) {
      children.push(
        label(
          strings.continentalCrustStringProperty,
          continentalX,
          crustLabelY(this.distanceAt(geometry, continentalX)),
          AXIS_FONT,
        ),
      );
    }

    // ── Boundary features ─────────────────────────────────────────────────────
    // Crossings can sit close together — the Chile profile clips the edge of the
    // Altiplano sliver a hundred kilometres behind the trench — so labels are
    // stacked upwards whenever they would collide.
    let previousX = Number.NEGATIVE_INFINITY;
    let stack = 0;
    const features: { x: number; targetY: number; name: TReadOnlyProperty<string>; velocity: number | null }[] =
      geometry.data.boundaryCrossings.map((crossing) => ({
        x: geometry.x(crossing.distanceKm),
        targetY: geometry.yFromElevation(geometry.elevationAt(crossing.distanceKm)),
        name:
          crossing.type === "convergent"
            ? strings.trenchStringProperty
            : crossing.type === "divergent"
              ? strings.ridgeStringProperty
              : strings.faultStringProperty,
        velocity: crossing.velocityMmPerYear,
      }));

    const arcDistanceKm = geometry.arcDistanceKm;
    if (arcDistanceKm !== null) {
      features.push({
        x: geometry.x(arcDistanceKm),
        targetY: geometry.yFromElevation(geometry.elevationAt(arcDistanceKm)),
        name: strings.arcStringProperty,
        velocity: null,
      });
    }
    features.sort((a, b) => a.x - b.x);

    for (const feature of features) {
      stack = feature.x - previousX < LABEL_COLLISION_PX ? (stack + 1) % LABEL_ROWS : 0;
      previousX = feature.x;
      const labelY = this.viewBounds.minY + 13 + stack * 27;

      // A leader line ties the label to the feature it names.
      children.push(
        new Line(feature.x, labelY + 6, feature.x, feature.targetY, {
          stroke: PlateTectonicsColors.mapFrameColorProperty,
          lineWidth: 0.8,
          opacity: 0.8,
        }),
      );
      children.push(label(feature.name, feature.x, labelY));
      if (feature.velocity !== null) {
        children.push(
          label(
            new PatternStringProperty(strings.relativeMotionStringProperty, {
              value: Math.round(feature.velocity),
            }),
            feature.x,
            labelY + 13,
            AXIS_FONT,
          ),
        );
      }
    }

    // The slab label points along the seismicity that defines it.
    const trace = geometry.slabTrace;
    if (trace.length >= 3) {
      const anchor = trace[Math.floor(trace.length * 0.7)] as (typeof trace)[number];
      children.push(label(strings.wadatiBenioffStringProperty, anchor.x + 74, anchor.y + 6, AXIS_FONT));
    }

    // ── Vertical exaggeration note ────────────────────────────────────────────
    const exaggeration = Math.round(geometry.verticalExaggeration);
    if (exaggeration > 1) {
      const note = new Text(
        new PatternStringProperty(strings.verticalExaggerationStringProperty, { value: exaggeration }),
        { font: NOTE_FONT, fill: PlateTectonicsColors.secondaryTextColorProperty },
      );
      note.right = this.viewBounds.maxX - 6;
      note.top = this.viewBounds.minY + 4;
      children.push(new Node({ children: [haloBehind(note), note] }));
    }

    // ── Distance axis ─────────────────────────────────────────────────────────
    const distanceLabel = new Text(
      new DerivedStringProperty(
        [strings.distanceAxisStringProperty],
        (axis: string) => `${axis} · 0 – ${Math.round(geometry.data.lengthKm)}`,
      ),
      { font: AXIS_FONT, fill: PlateTectonicsColors.secondaryTextColorProperty },
    );
    distanceLabel.centerX = this.viewBounds.centerX;
    distanceLabel.bottom = this.viewBounds.maxY - 4;
    children.push(new Node({ children: [haloBehind(distanceLabel), distanceLabel] }));

    return new Node({ children });
  }

  /** Inverse of `geometry.x`: the distance along the profile at a view x. */
  private distanceAt(geometry: CrossSectionGeometry, viewX: number): number {
    return ((viewX - this.viewBounds.minX) / this.viewBounds.width) * geometry.data.lengthKm;
  }

  /**
   * A representative x for the oceanic or continental crust label: the middle of
   * the longest run of columns of that kind.
   */
  private findCrustLabelX(geometry: CrossSectionGeometry, oceanic: boolean): number | null {
    const samples = 60;
    let bestStart = -1;
    let bestLength = 0;
    let runStart = -1;

    for (let i = 0; i <= samples; i++) {
      const distanceKm = (geometry.data.lengthKm * i) / samples;
      const matches = i < samples && geometry.isOceanic(distanceKm) === oceanic;
      if (matches && runStart === -1) {
        runStart = i;
      } else if (!matches && runStart !== -1) {
        if (i - runStart > bestLength) {
          bestLength = i - runStart;
          bestStart = runStart;
        }
        runStart = -1;
      }
    }

    if (bestLength < samples * 0.12) {
      return null;
    }
    return geometry.x((geometry.data.lengthKm * (bestStart + bestLength / 2)) / samples);
  }
}

/** A soft rectangle behind a text node, so small notes stay readable over the section. */
function haloBehind(node: Node): Node {
  const padding = 3;
  return new Rectangle(node.bounds.dilated(padding), {
    fill: PlateTectonicsColors.labelHaloColorProperty,
    opacity: 0.55,
    cornerRadius: 3,
  });
}
