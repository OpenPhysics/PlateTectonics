/**
 * hotspots.ts
 *
 * Major intraplate hotspots — long-lived volcanic centres fed by mantle plumes
 * rather than by a plate boundary. Unlike the volcanoes in `generated/volcanoData.ts`,
 * a hotspot is anchored in the deep mantle: plates slide over it, which is why the
 * Hawaiian–Emperor chain gets older to the north-west while only Kīlauea and Mauna
 * Loa erupt today.
 *
 * Positions are the present-day surface expression of each plume, rounded to the
 * nearest tenth of a degree. This is a hand-maintained list of the hotspots that
 * appear in introductory texts, not an exhaustive catalogue — plume lists differ
 * between authors, and the number of "real" plumes is itself an open question.
 */

import type { HotspotRecord } from "./dataTypes.js";

export const HOTSPOTS: readonly HotspotRecord[] = [
  { name: "Hawaii", lon: -155.3, lat: 19.4 },
  { name: "Iceland", lon: -17.3, lat: 64.4 },
  { name: "Yellowstone", lon: -110.7, lat: 44.4 },
  { name: "Galápagos", lon: -91.6, lat: -0.4 },
  { name: "Réunion", lon: 55.7, lat: -21.2 },
  { name: "Afar", lon: 42.4, lat: 11.6 },
  { name: "Canary", lon: -16.6, lat: 28.3 },
  { name: "Azores", lon: -25.5, lat: 37.8 },
  { name: "Easter", lon: -109.3, lat: -27.1 },
  { name: "Samoa", lon: -169.1, lat: -14.2 },
  { name: "Louisville", lon: -138.1, lat: -50.9 },
  { name: "Tristan da Cunha", lon: -12.3, lat: -37.1 },
  { name: "Kerguelen", lon: 69.2, lat: -49.6 },
  { name: "Marquesas", lon: -139.5, lat: -9.4 },
  { name: "Society", lon: -148.1, lat: -17.9 },
  { name: "Cape Verde", lon: -24.0, lat: 15.0 },
  { name: "St Helena", lon: -5.7, lat: -16.5 },
  { name: "Bouvet", lon: 3.4, lat: -54.4 },
  { name: "Ascension", lon: -14.4, lat: -7.9 },
  { name: "Comoros", lon: 43.4, lat: -11.8 },
  { name: "Cameroon", lon: 9.2, lat: 4.2 },
  { name: "Tibesti", lon: 17.5, lat: 20.5 },
  { name: "Hoggar", lon: 5.5, lat: 23.3 },
  { name: "Cobb", lon: -130.1, lat: 46.0 },
  { name: "Juan Fernández", lon: -78.8, lat: -33.6 },
  { name: "Macdonald", lon: -140.3, lat: -29.0 },
  { name: "Pitcairn", lon: -129.3, lat: -25.4 },
  { name: "Caroline", lon: 164.4, lat: 4.7 },
  { name: "Balleny", lon: 164.8, lat: -67.6 },
  { name: "Erebus", lon: 167.2, lat: -77.5 },
  { name: "Jan Mayen", lon: -8.2, lat: 71.1 },
  { name: "Eifel", lon: 6.9, lat: 50.2 },
  { name: "Trindade", lon: -29.3, lat: -20.5 },
  { name: "Fernando de Noronha", lon: -32.4, lat: -3.9 },
  { name: "Crozet", lon: 50.2, lat: -46.1 },
  { name: "Amsterdam", lon: 77.6, lat: -37.8 },
  { name: "Lord Howe", lon: 159.1, lat: -31.6 },
  { name: "Tasmantid", lon: 155.5, lat: -40.4 },
  { name: "Socorro", lon: -110.9, lat: 18.8 },
  { name: "Guadalupe", lon: -118.3, lat: 29.1 },
];
