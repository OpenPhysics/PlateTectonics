/**
 * plateTectonicsQueryParameters.ts
 *
 * Sim-specific startup query parameters. This is the single place where every
 * sim-specific query parameter is declared and documented. Public-facing
 * parameters (intended for end users / sharing links) must set `public: true`.
 *
 * ── How to add a query parameter ──────────────────────────────────────────────
 * 1. Add an entry below with a `type`, `defaultValue`, and (if user-facing)
 *    `public: true`. Add `isValidValue` to bound numeric ranges.
 * 2. If it should also be user-editable at runtime, surface it as a preference
 *    in PlateTectonicsPreferencesModel (initialize that Property from this query parameter).
 *
 * Usage: append e.g. `?showPlateLabels=false` to the sim URL.
 */

import { logGlobal } from "scenerystack/phet-core";
import { QueryStringMachine } from "scenerystack/query-string-machine";
import PlateTectonicsNamespace from "../PlateTectonicsNamespace.js";

const plateTectonicsQueryParameters = QueryStringMachine.getAll({
  /**
   * Draw each major plate's name on the map. On by default; turn it off with
   * `?showPlateLabels=false` for a cleaner map or for print.
   */
  showPlateLabels: {
    type: "boolean",
    defaultValue: true,
    public: true,
  },
});

PlateTectonicsNamespace.register("plateTectonicsQueryParameters", plateTectonicsQueryParameters);

// Log query parameters (for the console / PhET-iO).
logGlobal("phet.chipper.queryParameters");

export default plateTectonicsQueryParameters;
