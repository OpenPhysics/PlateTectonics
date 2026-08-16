/**
 * DeepTimeScreenView.ts
 *
 * Lays the Deep Time screen out:
 *
 *   ┌──────────────────────────────────────────┬───────────────┐
 *   │ title                     age on screen  │ show          │
 *   │ ┌──────────────────────────────────────┐ │               │
 *   │ │            globe                     │ ├───────────────┤
 *   │ └──────────────────────────────────────┘ │ geological    │
 *   │                                          │ time          │
 *   │                                    reset │               │
 *   └──────────────────────────────────────────┴───────────────┘
 *
 * Only the globe, no flat map. A reconstruction moves continents halfway round the
 * world, and an equirectangular map would tear them apart at the antimeridian and
 * stretch them beyond recognition near the poles — exactly where the interesting
 * motion is. The globe's camera lives here in the view rather than in the model,
 * because it is a way of looking at the Earth rather than a fact about it, which is
 * why Reset All puts it back through {@link DeepTimeScreenView.reset}.
 */

import { Shape } from "scenerystack/kite";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { Circle, Node, Text } from "scenerystack/scenery";
import { PhetFont, ResetAllButton } from "scenerystack/scenery-phet";
import { ScreenView, type ScreenViewOptions } from "scenerystack/sim";
import { attachGlobeRotation } from "../../common/attachGlobeRotation.js";
import { GlobeProjection } from "../../common/GlobeProjection.js";
import { FLAT_RESET_ALL_BUTTON_OPTIONS } from "../../common/PlateTectonicsButtonOptions.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { MAP_VIEW_BOUNDS, PANEL_SPACING, SCREEN_VIEW_MARGIN } from "../../PlateTectonicsConstants.js";
import type { DeepTimeModel } from "../model/DeepTimeModel.js";
import { DeepTimeCanvasNode } from "./DeepTimeCanvasNode.js";
import { DeepTimeClockPanel } from "./DeepTimeClockPanel.js";
import { DeepTimeControlPanel } from "./DeepTimeControlPanel.js";
import { DeepTimeScreenSummaryContent } from "./DeepTimeScreenSummaryContent.js";

const TITLE_FONT = new PhetFont({ size: 17, weight: "bold" });
const NOTE_FONT = new PhetFont(11);

export type DeepTimeScreenViewOptions = ScreenViewOptions;

export class DeepTimeScreenView extends ScreenView {
  private readonly globeProjection: GlobeProjection;

  public constructor(model: DeepTimeModel, providedOptions?: DeepTimeScreenViewOptions) {
    const options = optionize<DeepTimeScreenViewOptions, EmptySelfOptions, ScreenViewOptions>()(
      { screenSummaryContent: new DeepTimeScreenSummaryContent(model) },
      providedOptions,
    );
    super(options);

    const strings = StringManager.getInstance();
    const deepTime = strings.getDeepTimeStrings();
    const a11y = strings.getDeepTimeA11yStrings().controls;
    this.globeProjection = new GlobeProjection(MAP_VIEW_BOUNDS);

    // ── Globe ─────────────────────────────────────────────────────────────────
    const canvas = new DeepTimeCanvasNode(model, this.globeProjection);
    const limb = new Circle(this.globeProjection.radius, {
      center: MAP_VIEW_BOUNDS.center,
      stroke: PlateTectonicsColors.mapFrameColorProperty,
      lineWidth: 1.5,
    });
    const globeView = attachGlobeRotation(new Node({ children: [canvas, limb] }), {
      projection: this.globeProjection,
      accessibleNameProperty: a11y.globeStringProperty,
      accessibleHelpTextProperty: a11y.globeHelpStringProperty,
    });
    // Only the disc takes the drag, and the focus highlight traces it, so a pointer
    // on the empty corners is not silently grabbing a globe that is not there.
    const discShape = Shape.circle(MAP_VIEW_BOUNDS.centerX, MAP_VIEW_BOUNDS.centerY, this.globeProjection.radius);
    globeView.mouseArea = discShape;
    globeView.touchArea = discShape;
    globeView.focusHighlight = discShape;
    this.addChild(globeView);

    // ── Title and the stepping note ───────────────────────────────────────────
    const title = new Text(strings.getScreenNames().deepTimeStringProperty, {
      font: TITLE_FONT,
      fill: PlateTectonicsColors.textColorProperty,
      left: MAP_VIEW_BOUNDS.minX,
      bottom: MAP_VIEW_BOUNDS.minY - 8,
    });
    this.addChild(title);

    // Shown only away from the present day, where the difference between the gliding
    // continents and the stepping plates is actually visible.
    const snapshotNote = new Text(deepTime.snapshotNoteStringProperty, {
      font: NOTE_FONT,
      fill: PlateTectonicsColors.secondaryTextColorProperty,
      right: MAP_VIEW_BOUNDS.maxX,
      bottom: MAP_VIEW_BOUNDS.minY - 9,
    });
    this.addChild(snapshotNote);
    model.isPresentDayProperty.link((isPresentDay: boolean) => {
      snapshotNote.visible = !isPresentDay;
    });

    // ── Control column ────────────────────────────────────────────────────────
    const layerPanel = new DeepTimeControlPanel(model, {
      right: this.layoutBounds.maxX - SCREEN_VIEW_MARGIN,
      top: MAP_VIEW_BOUNDS.minY,
    });
    const clockPanel = new DeepTimeClockPanel(model, {
      right: this.layoutBounds.maxX - SCREEN_VIEW_MARGIN,
      top: layerPanel.bottom + PANEL_SPACING,
    });
    this.addChild(layerPanel);
    this.addChild(clockPanel);

    // ── Reset All ─────────────────────────────────────────────────────────────
    const resetAllButton = new ResetAllButton({
      ...FLAT_RESET_ALL_BUTTON_OPTIONS,
      listener: () => {
        model.reset();
        this.reset();
      },
      right: MAP_VIEW_BOUNDS.maxX,
      bottom: this.layoutBounds.maxY - SCREEN_VIEW_MARGIN,
    });
    this.addChild(resetAllButton);

    // ── Accessibility: keyboard / reading traversal order ─────────────────────
    // The globe comes first: it is the only thing in the play area that can be
    // operated, so a keyboard user should reach it before the controls.
    this.addChild(
      new Node({
        pdomOrder: [globeView, ...layerPanel.focusOrder, ...clockPanel.focusOrder, resetAllButton],
      }),
    );
  }

  /** Resets view-side state: the camera, which is not model state. */
  public reset(): void {
    this.globeProjection.reset();
  }

  /**
   * The reconstruction is driven by the model clock, which the Sim steps; the canvas
   * repaints from its Property links, so nothing is needed here.
   */
  public override step(_dt: number): void {
    // Intentionally empty — see the class documentation.
  }
}
