/**
 * main.ts
 *
 * Entry point for the simulation. Initializes SceneryStack, creates the
 * screens, and starts the main event loop.
 *
 * !! CRITICAL IMPORT ORDER !!
 * brand.js MUST be the first import. Each module imports the next, so the import nesting is
 *
 *   main → brand → splash → assert → init
 *
 * and therefore the actual EXECUTION order (deepest import runs first) is the reverse:
 *
 *   init → assert → splash → brand → main
 *
 * SceneryStack requires this exact load order. Never reorder these imports.
 */

// brand.js MUST be first; importing it runs the whole chain (init→assert→splash→brand) before main.
import "./brand.js";

import { onReadyToLaunch, PreferencesModel, Sim } from "scenerystack/sim";
import { Tandem } from "scenerystack/tandem";
import { CrustScreen } from "./crust/CrustScreen.js";
import { StringManager } from "./i18n/StringManager.js";
import PlateTectonicsColors from "./PlateTectonicsColors.js";
import { PlateMotionScreen } from "./plate-motion/PlateMotionScreen.js";
import { PlateTectonicsScreen } from "./plate-tectonics/PlateTectonicsScreen.js";
import { PlateTectonicsPreferencesModel } from "./preferences/PlateTectonicsPreferencesModel.js";
import { PlateTectonicsPreferencesNode } from "./preferences/PlateTectonicsPreferencesNode.js";

onReadyToLaunch(() => {
  const stringManager = StringManager.getInstance();

  // Simulation-specific preferences; initial values come from plateTectonicsQueryParameters.
  const simPreferences = new PlateTectonicsPreferencesModel(Tandem.ROOT.createTandem("preferences"));

  const screens = [
    new PlateTectonicsScreen(simPreferences, {
      name: stringManager.getScreenNames().plateTectonicsStringProperty,
      tandem: Tandem.ROOT.createTandem("plateTectonicsScreen"),
      backgroundColorProperty: PlateTectonicsColors.backgroundColorProperty,
    }),
    new CrustScreen(simPreferences, {
      name: stringManager.getScreenNames().crustStringProperty,
      tandem: Tandem.ROOT.createTandem("crustScreen"),
      backgroundColorProperty: PlateTectonicsColors.backgroundColorProperty,
    }),
    new PlateMotionScreen(simPreferences, {
      name: stringManager.getScreenNames().plateMotionStringProperty,
      tandem: Tandem.ROOT.createTandem("plateMotionScreen"),
      backgroundColorProperty: PlateTectonicsColors.backgroundColorProperty,
    }),
  ];

  const sim = new Sim(stringManager.getTitleStringProperty(), screens, {
    preferencesModel: new PreferencesModel({
      visualOptions: {
        // Adds a "Projector Mode" toggle in Preferences → Visual
        supportsProjectorMode: true,
        // Enables keyboard-navigation highlight outlines
        supportsInteractiveHighlights: true,
      },
      simulationOptions: {
        customPreferences: [
          {
            createContent: (tandem: Tandem) => new PlateTectonicsPreferencesNode(simPreferences, tandem),
          },
        ],
      },
      localizationOptions: {
        // Adds a language picker in Preferences → Language
        supportsDynamicLocale: true,
      },
    }),

    // Shown in Help → About. The data sources are credited here as well as on
    // screen, because two of them ask for attribution and all of them deserve it.
    credits: {
      leadDesign: "OpenPhysics",
      softwareDevelopment: "OpenPhysics",
      team: "OpenPhysics",
      qualityAssurance: "",
      graphicArts: "",
      thanks:
        "Plate model: Bird (2003), doi:10.1029/2001GC000252, via fraxen/tectonicplates (ODC-BY 1.0). " +
        "Coastlines: Natural Earth. Earthquakes: USGS ANSS. Volcanoes: NOAA NCEI / Smithsonian GVP. " +
        "Elevation and bathymetry: NOAA NCEI.",
    },
  });

  sim.start();
});
