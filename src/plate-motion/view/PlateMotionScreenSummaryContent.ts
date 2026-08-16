/**
 * PlateMotionScreenSummaryContent.ts
 *
 * The accessible screen summary for the Plate Motion screen.
 *
 * `currentDetailsContent` answers the questions the picture answers: what is at the
 * boundary, what it is doing, and how far through it is. The middle one names the
 * *behaviour* rather than the motion type — "the right plate is subducting beneath the
 * other" rather than "convergent" — because which plate goes down is the thing the screen
 * exists to teach, and it is not recoverable from the word "convergent" alone.
 */

import { DerivedStringProperty } from "scenerystack/axon";
import { ScreenSummaryContent } from "scenerystack/sim";
import { createSectionViewDescription } from "../../common/view/sectionViewDescription.js";
import { StringManager } from "../../i18n/StringManager.js";
import type { BoundaryBehavior, Side } from "../model/BoundaryRules.js";
import type { PlateMotionModel } from "../model/PlateMotionModel.js";
import type { PlateType } from "../model/PlateType.js";

export class PlateMotionScreenSummaryContent extends ScreenSummaryContent {
  public constructor(model: PlateMotionModel) {
    const strings = StringManager.getInstance();
    const a11y = strings.getPlateMotionA11yStrings();
    const motion = strings.getPlateMotionStrings();

    const plates = new DerivedStringProperty(
      [
        model.leftPlateTypeProperty,
        model.rightPlateTypeProperty,
        a11y.platesNoneStringProperty,
        a11y.platesOneStringProperty,
        a11y.platesBothStringProperty,
        motion.continentalStringProperty,
        motion.youngOceanicStringProperty,
        motion.oldOceanicStringProperty,
      ],
      (
        left: PlateType | null,
        right: PlateType | null,
        none: string,
        one: string,
        both: string,
        continental: string,
        youngOceanic: string,
        oldOceanic: string,
      ) => {
        if (left === null && right === null) {
          return none;
        }
        if (left === null || right === null) {
          return one;
        }
        const name = (type: PlateType): string =>
          type === "continental" ? continental : type === "youngOceanic" ? youngOceanic : oldOceanic;
        return both.replace("{{left}}", name(left)).replace("{{right}}", name(right));
      },
    );

    const motionDetails = new DerivedStringProperty(
      [
        model.behaviorProperty,
        model.subductingSideProperty,
        a11y.motionNoneStringProperty,
        a11y.motionSubductionStringProperty,
        a11y.motionCollisionStringProperty,
        a11y.motionRiftingStringProperty,
        a11y.sideLeftStringProperty,
        a11y.sideRightStringProperty,
      ],
      (
        behavior: BoundaryBehavior | null,
        side: Side | null,
        none: string,
        subduction: string,
        collision: string,
        rifting: string,
        leftWord: string,
        rightWord: string,
      ) => {
        if (behavior === null) {
          return none;
        }
        if (behavior === "collision") {
          return collision;
        }
        if (behavior === "rifting") {
          return rifting;
        }
        return subduction.replace("{{side}}", side === "left" ? leftWord : rightWord);
      },
    );

    const timeDetails = new DerivedStringProperty(
      [
        model.timeMillionsOfYearsProperty,
        model.animationStartedProperty,
        model.isFinishedProperty,
        model.timeLimitMyrProperty,
        a11y.timeIdleStringProperty,
        a11y.timeRunningStringProperty,
        a11y.timeFinishedStringProperty,
      ],
      (
        tMyr: number,
        started: boolean,
        finished: boolean,
        limit: number,
        idle: string,
        running: string,
        done: string,
      ) => {
        if (!started) {
          return idle;
        }
        return finished ? done.replace("{{value}}", limit.toFixed(0)) : running.replace("{{value}}", tMyr.toFixed(0));
      },
    );

    // Which mode is on decides what everything else on the screen does, so it is part of
    // the live description rather than something a reader has to go and check.
    const modeDetails = new DerivedStringProperty(
      [model.isManualModeProperty, a11y.modeAutomaticStringProperty, a11y.modeManualStringProperty],
      (manual: boolean, automatic: string, manualText: string) => (manual ? manualText : automatic),
    );

    const viewDetails = createSectionViewDescription(model.sectionView);

    const currentDetails = new DerivedStringProperty(
      [a11y.currentDetailsStringProperty, plates, motionDetails, modeDetails, timeDetails, viewDetails],
      (pattern: string, platesText: string, motionText: string, modeText: string, timeText: string, viewText: string) =>
        pattern
          .replace("{{plates}}", platesText)
          .replace("{{motion}}", motionText)
          .replace("{{mode}}", modeText)
          .replace("{{time}}", timeText)
          .replace("{{view}}", viewText),
    );

    super({
      playAreaContent: a11y.screenSummary.playAreaStringProperty,
      controlAreaContent: a11y.screenSummary.controlAreaStringProperty,
      currentDetailsContent: currentDetails,
      interactionHintContent: a11y.screenSummary.interactionHintStringProperty,
    });

    this.disposeEmitter.addListener(() => {
      currentDetails.dispose();
      viewDetails.dispose();
      modeDetails.dispose();
      timeDetails.dispose();
      motionDetails.dispose();
      plates.dispose();
    });
  }
}
