/**
 * scripts/data/gplates.ts
 *
 * Runs the GPlates plate-motion model, so `build-data.ts` can treat deep-time
 * reconstruction as one more dataset to fetch.
 *
 * Reconstructing plate topologies is not something to reimplement: the rotation
 * files are a *hierarchy* of relative rotations whose shape changes with time, and
 * a plate polygon at 100 Ma is rebuilt from whichever moving boundary features
 * bounded it then. `pygplates` is the reference implementation of both, so this
 * module sets up a throwaway virtualenv, downloads the model, and shells out to
 * `gplates/resolve.py`.
 *
 * That makes Python a *build-time* dependency of `npm run build-data plate-history`
 * only — never of `npm run build`, `npm test` or the shipped sim, which read the
 * committed output like any other generated module. The resolved JSON is itself
 * cached, so re-running the step to re-tune simplification costs nothing.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fetchBinary } from "./fetchCache.js";

/**
 * Müller et al. (2019), "A Global Plate Model Including Lithospheric Deformation
 * Along Major Rifts and Orogens Since the Triassic", Tectonics 38(6), 1884–1907,
 * doi:10.1029/2018TC005462. Distributed by EarthByte under CC BY 4.0.
 */
const MODEL_URL =
  "https://www.earthbyte.org/webdav/ftp/Data_Collections/Muller_etal_2019_Tectonics/" +
  "Muller_etal_2019_PlateMotionModel/Muller_etal_2019_PlateMotionModel_v2.0_Tectonics_Updated.zip";

/** Directory inside the archive that holds the `.rot` and `.gpml` files. */
const MODEL_SUBDIR = "Muller_etal_2019_PlateMotionModel_v2.0_Tectonics_Updated";

const CACHE_DIR = resolve(process.cwd(), ".cache", "gplates");
const VENV_DIR = join(CACHE_DIR, "venv");
const MODEL_DIR = join(CACHE_DIR, "model");

/** One resolved instant: the plates that existed then, and the boundaries between them. */
export interface GPlatesSnapshot {
  readonly time: number;
  readonly plates: readonly {
    readonly id: number;
    readonly name: string;
    /** True for a deforming belt — an orogen or a rift — rather than a rigid plate. */
    readonly deforming: boolean;
    /** Flat `[lon, lat, …]` closed ring in degrees. */
    readonly ring: readonly number[];
  }[];
  readonly boundaries: readonly {
    readonly type: "divergent" | "convergent" | "transform";
    readonly coords: readonly number[];
  }[];
}

export interface GPlatesModelData {
  readonly model: string;
  /** Sample times in Ma, ascending from 0. */
  readonly times: readonly number[];
  readonly snapshots: readonly GPlatesSnapshot[];
  /** Present-day coastline geometry, each piece tagged with the plate carrying it. */
  readonly coastlines: readonly {
    readonly plateId: number;
    readonly coords: readonly number[];
  }[];
  /**
   * Total reconstruction rotation per plate ID, one `[poleLat, poleLon, angleDeg]`
   * per entry of {@link times}.
   */
  readonly rotations: Readonly<Record<string, readonly (readonly number[])[]>>;
}

/** Path to the virtualenv's interpreter, on either kind of platform. */
function venvPython(): string {
  return process.platform === "win32" ? join(VENV_DIR, "Scripts", "python.exe") : join(VENV_DIR, "bin", "python");
}

/** Runs a command, letting its output through so long steps show progress. */
function run(command: string, args: readonly string[]): void {
  execFileSync(command, args as string[], { stdio: ["ignore", "inherit", "inherit"] });
}

/**
 * Creates the virtualenv and installs `pygplates` into it, once. Subsequent runs
 * find it already there and return immediately.
 */
function ensurePygplates(): string {
  const python = venvPython();
  if (existsSync(python)) {
    try {
      execFileSync(python, ["-c", "import pygplates"], { stdio: "ignore" });
      return python;
    } catch {
      // Virtualenv exists but is unusable — fall through and rebuild it.
    }
  }

  console.log("  creating a Python virtualenv for pygplates…");
  mkdirSync(CACHE_DIR, { recursive: true });
  try {
    run("python3", ["-m", "venv", VENV_DIR]);
  } catch (error) {
    throw new Error(
      "python3 with the venv module is required to rebuild the plate history " +
        "(the other build-data steps do not need it).\n" +
        `  ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  run(python, ["-m", "pip", "install", "--quiet", "--disable-pip-version-check", "pygplates"]);
  return python;
}

/** Downloads and unpacks the plate-motion model, once. Returns the unpacked directory. */
async function ensureModel(): Promise<string> {
  const modelPath = join(MODEL_DIR, MODEL_SUBDIR);
  if (existsSync(modelPath)) {
    return modelPath;
  }

  const archive = await fetchBinary(MODEL_URL, "muller2019_plate_model.zip");
  mkdirSync(MODEL_DIR, { recursive: true });
  const archivePath = join(CACHE_DIR, "model.zip");
  writeFileSync(archivePath, archive);

  console.log("  unpacking the plate-motion model…");
  try {
    run("unzip", ["-o", "-q", archivePath, "-d", MODEL_DIR]);
  } catch (error) {
    throw new Error(
      `Could not unpack ${archivePath} — the \`unzip\` command is required to rebuild the plate history.\n` +
        `  ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!existsSync(modelPath)) {
    throw new Error(`Expected ${MODEL_SUBDIR}/ inside the model archive; got something else.`);
  }
  return modelPath;
}

/**
 * Resolves the model at every `stepMa` from the present day back to `endMa`, and
 * returns plate polygons, boundaries, coastlines and the rotation table.
 *
 * The resolved JSON is cached under `.cache/gplates/`, keyed by the span and step,
 * because resolving 51 instants takes about a minute and the simplification applied
 * to the result downstream is the part actually worth re-tuning.
 */
export async function resolvePlateHistory(endMa: number, stepMa: number): Promise<GPlatesModelData> {
  const cachePath = join(CACHE_DIR, `resolved-${endMa}Ma-${stepMa}Myr.json`);
  if (existsSync(cachePath)) {
    console.log(`  using cached ${cachePath}`);
    return JSON.parse(readFileSync(cachePath, "utf8")) as GPlatesModelData;
  }

  const python = ensurePygplates();
  const modelPath = await ensureModel();

  console.log(`  resolving topologies every ${stepMa} Myr from 0 to ${endMa} Ma…`);
  run(python, [
    resolve(process.cwd(), "scripts", "data", "gplates", "resolve.py"),
    modelPath,
    cachePath,
    String(endMa),
    String(stepMa),
  ]);

  return JSON.parse(readFileSync(cachePath, "utf8")) as GPlatesModelData;
}
