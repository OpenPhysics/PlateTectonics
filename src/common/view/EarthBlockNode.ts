/**
 * EarthBlockNode.ts
 *
 * The 3-D block of Earth that the Crust and Plate Motion screens are drawn on: a slab
 * with ground on top, a cross-section across its front face, and real thickness between
 * them, bent around the curvature of the planet.
 *
 * ── What this is for ──────────────────────────────────────────────────────────
 * A flat cross-section can show the layers but not that they are a *cut* through
 * something. PhET's Java version drew both of these tabs as a block diagram for that
 * reason, and it is the reason the block is back: the terrain surface is what tells the
 * reader that the top of the section is the ground, that the sea lies in the low parts
 * of it, and that a mountain range built by a collision is a landscape rather than a
 * bump on a line.
 *
 * ── How the drawing is organised ──────────────────────────────────────────────
 * Everything is emitted as faces into a {@link QuadRenderer}, which sorts them back to
 * front — see its header for why that is the right substitute for a depth buffer here.
 * Faces fall into fixed draw-order groups, and the groups exist because depth alone
 * cannot order coplanar things:
 *
 *   0  the solid: the terrain heightfield and the two end walls, depth-sorted
 *   1  the sea surface, always over the sea floor it covers
 *   2  the rock of the cross-section, on the front plane
 *   3  the water wedge of the cross-section, in the same plane
 *   4+ features on the section — a slab, magma, volcanoes
 *   8  flat overlay such as motion arrows
 *
 * ── What each screen supplies ─────────────────────────────────────────────────
 * The base class owns the block, the terrain, the walls, the water and the camera. A
 * subclass says how high the ground is, what rock is at a point, and — if its section is
 * made of bands with sharp boundaries rather than a sampled field — how to paint it.
 *
 * The default section is a grid sampled from {@link materialColorAt}, which is what the
 * Crust screen wants: it colours rock by a continuous property, so a geotherm has to
 * show as a gradient. The Plate Motion screen overrides it with band polygons instead,
 * because its layers have exact boundaries that grid sampling would turn into stairs.
 *
 * ── The limits of this renderer ───────────────────────────────────────────────
 * Flat shading, one colour per face, and no texture. Java had a GPU, per-vertex normals
 * and a tiled noise overlay. The grids here are sampled finely enough that the ground
 * reads as a surface, but a close look finds facets, and that is the cost of keeping the
 * whole pipeline a pure function that runs without WebGL.
 */

import { type Bounds2, Vector2, type Vector3 } from "scenerystack/dot";
import { CanvasNode, type CanvasNodeOptions, type Color } from "scenerystack/scenery";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { EARTH_RADIUS_M, radialFromDirections, xRadialVector, zRadialVector } from "../model/EarthCurvature.js";
import { QuadRenderer } from "./QuadRenderer.js";
import { SceneCamera } from "./SceneCamera.js";
import { terrainColor } from "./TerrainColors.js";

/** The slab of Earth a screen draws, in metres. `maxZM` is the front face. */
export type BlockBounds = {
  readonly minXM: number;
  readonly maxXM: number;
  readonly minYM: number;
  readonly maxYM: number;
  readonly minZM: number;
  readonly maxZM: number;
};

/**
 * Draw-order groups. See the class header for what each one is holding apart.
 *
 * Spaced ten apart so a subclass can subdivide a group without colliding with the next
 * one — the Plate Motion section needs four sub-orders inside `sectionRock` alone, for
 * the mantle, the slab and a plate's two bands.
 */
export const BLOCK_LAYER = {
  solid: 0,
  seaSurface: 10,
  sectionRock: 20,
  sectionWater: 30,
  sectionFeature: 40,
  overlay: 80,
} as const;

/** Samples across the block's width, for the terrain and the section grid. */
const TERRAIN_COLUMNS = 72;

/** Samples from the front of the block to the back, for the terrain. */
const TERRAIN_ROWS = 16;

/** Samples down each end wall. Coarser than the section: the walls are seen edge-on. */
const WALL_ROWS = 20;

/** Rows in the default sampled cross-section. */
const SECTION_ROWS = 44;

/**
 * Amplitude of the deterministic roughness added to high ground, m.
 *
 * PhET's `TerrainSample` carried a `randomElevationOffset` for the same purpose: a
 * mountain range built by a smooth analytic function looks like a smooth analytic
 * function, and real ranges are made of peaks. Deterministic rather than random, because
 * the Plate Motion screen's whole design is that the picture is a pure function of the
 * clock — see doc/implementation-notes.md — and a per-frame random offset would make the
 * mountains shimmer while the clock was paused.
 */
const TERRAIN_ROUGHNESS_M = 320;

/** Elevation by which roughness has reached full strength, m. The sea floor stays smooth. */
const TERRAIN_ROUGHNESS_FULL_M = 2500;

/**
 * A deterministic value in [−1, 1] from a pair of grid indices.
 *
 * A hash rather than a noise library: it only has to be reproducible and free of visible
 * periodicity at the scale of one block.
 */
function hashNoise(i: number, j: number): number {
  const value = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return 2 * (value - Math.floor(value)) - 1;
}

export type EarthBlockNodeOptions = CanvasNodeOptions;

export abstract class EarthBlockNode extends CanvasNode {
  protected readonly faceRenderer: QuadRenderer;

  /** Named viewBounds, not bounds: Node.bounds belongs to the base class. */
  protected readonly viewBounds: Bounds2;

  private camera: SceneCamera;

  /** Set when the block or the exaggeration changed and the framing has to be redone. */
  private cameraStale = true;

  private exaggeration = 1;

  protected constructor(viewBounds: Bounds2, providedOptions?: EarthBlockNodeOptions) {
    super({ canvasBounds: viewBounds, ...providedOptions });

    this.viewBounds = viewBounds;
    this.camera = SceneCamera.framing([], { viewBounds });
    this.faceRenderer = new QuadRenderer(this.camera);
  }

  // ── What a screen has to supply ─────────────────────────────────────────────

  /** The slab this screen is drawing, in metres. */
  protected abstract blockBounds(): BlockBounds;

  /** Elevation of the ground at a point on the block's top surface, m. */
  protected abstract terrainElevationM(xM: number, zM: number): number;

  /**
   * The colour of the rock at a point on the cross-section, or null where there is no
   * rock — above the ground, or in the water.
   */
  protected abstract materialColorAt(xM: number, elevationM: number): Color | null;

  /** Whether the sea is drawn. */
  protected abstract get showWater(): boolean;

  // ── Hooks a screen may override ─────────────────────────────────────────────

  /**
   * Paints the rock of the cross-section onto the front face.
   *
   * The default samples {@link materialColorAt} on a grid, which is what a screen
   * colouring rock by a continuous property needs. Override it where the layers have
   * exact boundaries worth keeping sharp.
   */
  protected paintSectionFace(): void {
    const block = this.blockBounds();
    const frontZ = block.maxZM;
    const columnWidth = (block.maxXM - block.minXM) / TERRAIN_COLUMNS;

    for (let column = 0; column < TERRAIN_COLUMNS; column++) {
      const leftXM = block.minXM + column * columnWidth;
      const rightXM = leftXM + columnWidth;
      const centreXM = leftXM + columnWidth / 2;

      // Start each column at its own ground level rather than at the top of the block,
      // so the section stops where the landscape does instead of painting rock into the
      // sky above a valley.
      const topM = Math.min(block.maxYM, this.terrainElevationM(centreXM, frontZ));
      if (topM <= block.minYM) {
        continue;
      }
      const rowHeight = (topM - block.minYM) / SECTION_ROWS;

      for (let row = 0; row < SECTION_ROWS; row++) {
        const upperM = topM - row * rowHeight;
        const lowerM = upperM - rowHeight;
        const color = this.materialColorAt(centreXM, (upperM + lowerM) / 2);
        if (color) {
          this.addFrontQuad(leftXM, upperM, rightXM, lowerM, color, BLOCK_LAYER.sectionRock);
        }
      }
    }
  }

  /** Extra things on the section — a slab, magma, volcanoes. Nothing by default. */
  protected paintSectionFeatures(): void {
    // Intentionally empty; see the class documentation.
  }

  /** Flat overlay drawn last, over everything. Nothing by default. */
  protected paintOverlay(): void {
    // Intentionally empty; see the class documentation.
  }

  /**
   * How rough the ground is at a point, m.
   *
   * Zero at and below sea level and full strength on high ground, so an abyssal plain
   * stays flat and a mountain range does not.
   */
  protected terrainRoughnessM(elevationM: number): number {
    if (elevationM <= 0) {
      return 0;
    }
    return TERRAIN_ROUGHNESS_M * Math.min(1, elevationM / TERRAIN_ROUGHNESS_FULL_M);
  }

  // ── Helpers for subclasses ──────────────────────────────────────────────────

  /**
   * A planar model point as a point in the scene: exaggerated vertically, then curved.
   *
   * The exaggeration is applied to the elevation *before* the bend, so a stretched block
   * is a stretched piece of a sphere rather than a piece of a stretched sphere — layers
   * stay parallel to the surface, which is the property the picture is making a claim
   * about.
   */
  protected scenePoint(xM: number, elevationM: number, zM: number): Vector3 {
    return radialFromDirections(xRadialVector(xM), zRadialVector(zM), elevationM * this.exaggeration);
  }

  /** An axis-aligned rectangle on the block's front face. */
  protected addFrontQuad(
    leftXM: number,
    topM: number,
    rightXM: number,
    bottomM: number,
    color: Color,
    layer: number,
  ): void {
    const z = this.blockBounds().maxZM;
    this.faceRenderer.addFace(
      [
        this.scenePoint(leftXM, topM, z),
        this.scenePoint(rightXM, topM, z),
        this.scenePoint(rightXM, bottomM, z),
        this.scenePoint(leftXM, bottomM, z),
      ],
      color,
      { layer, shade: false },
    );
  }

  /**
   * An arbitrary polygon on the block's front face.
   *
   * Unshaded, because the front face is one flat plane: shading it by its normal would
   * give every polygon on it the same factor, and shading it by anything else would
   * imply relief that is not there.
   */
  protected addFrontPolygon(points: readonly Vector2[], color: Color, layer: number): void {
    this.addPolygonAtZ(points, this.blockBounds().maxZM, color, layer);
  }

  /**
   * An arbitrary polygon on a plane of constant z inside the block.
   *
   * For things that stand at a depth into the block rather than on its cut face — the
   * plumes over a volcanic arc, which is a chain across the block and not a single cone on
   * the section. Unshaded for the same reason `addFrontPolygon` is: every polygon on one
   * such plane shares a normal, so shading by it would tint them all identically.
   */
  protected addPolygonAtZ(points: readonly Vector2[], zM: number, color: Color, layer: number): void {
    if (points.length < 3) {
      return;
    }
    this.faceRenderer.addFace(
      points.map((point) => this.scenePoint(point.x, point.y, zM)),
      color,
      { layer, shade: false },
    );
  }

  /**
   * The region between two profiles sampled across the same span, as one polygon.
   *
   * Both profiles have to run in the same direction along x — the same invariant
   * `PlateOutline` documents — or the closed ring crosses itself into a bowtie.
   */
  protected addFrontBand(top: readonly Vector2[], bottom: readonly Vector2[], color: Color, layer: number): void {
    if (top.length < 2 || bottom.length < 2) {
      return;
    }
    this.addFrontPolygon([...top, ...[...bottom].reverse()], color, layer);
  }

  // ── State ───────────────────────────────────────────────────────────────────

  /** Sets the vertical stretch applied to every elevation. 1 is true scale. */
  public setVerticalExaggeration(exaggeration: number): void {
    if (exaggeration !== this.exaggeration) {
      this.exaggeration = exaggeration;
      this.invalidateCamera();
    }
  }

  public get verticalExaggeration(): number {
    return this.exaggeration;
  }

  /** Marks the framing as needing to be redone, e.g. after a zoom changes the block. */
  public invalidateCamera(): void {
    this.cameraStale = true;
    this.invalidatePaint();
  }

  /**
   * The camera the block is currently drawn through.
   *
   * Public because the labels and the tools are Scenery nodes positioned by projecting
   * their model coordinates — they have to use exactly the camera the picture was drawn
   * with, or they drift off the features they name.
   */
  public getCamera(): SceneCamera {
    if (this.cameraStale) {
      this.refreshCamera();
    }
    return this.camera;
  }

  /** Where a planar model point lands on the screen. */
  public modelToView(xM: number, elevationM: number, zM: number): Vector2 {
    const projected = this.getCamera().project(this.scenePoint(xM, elevationM, zM));
    return new Vector2(projected.x, projected.y);
  }

  /**
   * Where a screen point lands on the block's front face, in planar model coordinates,
   * or null if the ray misses. The inverse of {@link modelToView} on that plane.
   */
  public viewToFrontFace(viewPoint: Vector2): Vector2 | null {
    const block = this.blockBounds();

    // The curved front face is the plane z = 0 exactly when the face sits at planar
    // z = 0, which is where both screens put it — a point there has φ = π/2, so its
    // scene z is r·cos φ = 0 whatever its elevation. A block whose front face sat
    // elsewhere would get a shallow cone instead, and the tangent plane through the
    // middle of it is then an approximation good to a fraction of a pixel at these
    // sizes. Either way the intersection stays closed-form.
    const scenePoint = this.getCamera().intersectPlaneZ(viewPoint, this.scenePoint(0, 0, block.maxZM).z);
    if (!scenePoint) {
      return null;
    }

    // Invert the curvature: the two components in the plane give the radius and the
    // angle directly, and `sin φ` divides out the foreshortening of a face that is not
    // at z = 0. Undoing the exaggeration last returns true model metres.
    const inPlaneRadius = Math.hypot(scenePoint.x, scenePoint.y + EARTH_RADIUS_M);
    const sinPhi = Math.cos(block.maxZM / EARTH_RADIUS_M);
    const radius = sinPhi === 0 ? inPlaneRadius : inPlaneRadius / sinPhi;

    return new Vector2(
      Math.atan2(scenePoint.x, scenePoint.y + EARTH_RADIUS_M) * EARTH_RADIUS_M,
      (radius - EARTH_RADIUS_M) / this.exaggeration,
    );
  }

  // ── Painting ────────────────────────────────────────────────────────────────

  public override paintCanvas(context: CanvasRenderingContext2D): void {
    if (this.cameraStale) {
      this.refreshCamera();
    }

    context.fillStyle = PlateTectonicsColors.skyColorProperty.value.toCSS();
    context.fillRect(this.viewBounds.minX, this.viewBounds.minY, this.viewBounds.width, this.viewBounds.height);

    this.faceRenderer.clear();
    this.paintTerrain();
    this.paintEndWalls();
    this.paintSectionFace();
    if (this.showWater) {
      this.paintWater();
    }
    this.paintSectionFeatures();
    this.paintOverlay();
    this.faceRenderer.paint(context);
  }

  /** The ground, as a heightfield of quads across the top of the block. */
  private paintTerrain(): void {
    const block = this.blockBounds();
    const xs = this.terrainXPositions(block);
    const zs = this.terrainZPositions(block);

    // The heightfield is sampled once into a grid rather than four times per quad: every
    // interior vertex is shared by four of them, and terrainElevationM is the expensive
    // call on both screens.
    const elevations: number[][] = [];
    for (let i = 0; i < xs.length; i++) {
      const row: number[] = [];
      const xM = xs[i] ?? 0;
      for (let j = 0; j < zs.length; j++) {
        const zM = zs[j] ?? 0;
        const base = this.terrainElevationM(xM, zM);
        row.push(base + hashNoise(i, j) * this.terrainRoughnessM(base));
      }
      elevations.push(row);
    }

    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < zs.length - 1; j++) {
        const x0 = xs[i] ?? 0;
        const x1 = xs[i + 1] ?? 0;
        const z0 = zs[j] ?? 0;
        const z1 = zs[j + 1] ?? 0;
        const e00 = elevations[i]?.[j] ?? 0;
        const e10 = elevations[i + 1]?.[j] ?? 0;
        const e11 = elevations[i + 1]?.[j + 1] ?? 0;
        const e01 = elevations[i]?.[j + 1] ?? 0;

        // Wound so the normal points up out of the ground, which is what makes the
        // Lambert factor light the top of the block rather than shade it.
        this.faceRenderer.addFace(
          [
            this.scenePoint(x0, e00, z0),
            this.scenePoint(x0, e01, z1),
            this.scenePoint(x1, e11, z1),
            this.scenePoint(x1, e10, z0),
          ],
          terrainColor((e00 + e10 + e11 + e01) / 4),
          { layer: BLOCK_LAYER.solid },
        );
      }
    }
  }

  /**
   * The left and right ends of the block.
   *
   * Without them the block has no thickness at its edges and the terrain reads as a
   * carpet floating over the section. They are sampled from {@link materialColorAt} like
   * the default section is, but coarsely: at a 13° tilt they are seen almost edge-on.
   */
  private paintEndWalls(): void {
    const block = this.blockBounds();
    const zs = this.terrainZPositions(block);

    for (const [xM, outwardIsLeft] of [
      [block.minXM, true],
      [block.maxXM, false],
    ] as const) {
      for (let j = 0; j < zs.length - 1; j++) {
        const z0 = zs[j] ?? 0;
        const z1 = zs[j + 1] ?? 0;
        const topM = Math.min(block.maxYM, (this.terrainElevationM(xM, z0) + this.terrainElevationM(xM, z1)) / 2);
        if (topM <= block.minYM) {
          continue;
        }
        const rowHeight = (topM - block.minYM) / WALL_ROWS;

        for (let row = 0; row < WALL_ROWS; row++) {
          const upperM = topM - row * rowHeight;
          const lowerM = upperM - rowHeight;
          const color = this.materialColorAt(xM, (upperM + lowerM) / 2);
          if (!color) {
            continue;
          }

          // Wound so the normal points away from the block on whichever end this is —
          // the two ends face opposite directions, and getting one of them backwards
          // lights it as if the sun were inside the Earth.
          const corners = [
            this.scenePoint(xM, upperM, z0),
            this.scenePoint(xM, upperM, z1),
            this.scenePoint(xM, lowerM, z1),
            this.scenePoint(xM, lowerM, z0),
          ];
          this.faceRenderer.addFace(outwardIsLeft ? corners : [...corners].reverse(), color, {
            layer: BLOCK_LAYER.solid,
          });
        }
      }
    }
  }

  /**
   * The sea: a surface at sea level wherever the ground is below it, plus the wedge of
   * water that the front face cuts through.
   *
   * Drawn as opaque fills in its own layer rather than as a translucent sheet over the
   * sea floor. Alpha over a painter's-algorithm stack is only correct if everything
   * underneath has already been drawn in the right order, and the saving — being able to
   * see the sea floor through the water — is not worth making the sea's colour depend on
   * what happens to be behind it.
   */
  private paintWater(): void {
    const block = this.blockBounds();
    const xs = this.terrainXPositions(block);
    const zs = this.terrainZPositions(block);
    const water = PlateTectonicsColors.seaWaterColorProperty.value;

    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < zs.length - 1; j++) {
        const x0 = xs[i] ?? 0;
        const x1 = xs[i + 1] ?? 0;
        const z0 = zs[j] ?? 0;
        const z1 = zs[j + 1] ?? 0;

        // Only where all four corners are under water, so the shoreline follows the
        // terrain grid instead of the sea spilling up onto the beach.
        const submerged =
          this.terrainElevationM(x0, z0) < 0 &&
          this.terrainElevationM(x1, z0) < 0 &&
          this.terrainElevationM(x1, z1) < 0 &&
          this.terrainElevationM(x0, z1) < 0;
        if (!submerged) {
          continue;
        }

        this.faceRenderer.addFace(
          [
            this.scenePoint(x0, 0, z0),
            this.scenePoint(x0, 0, z1),
            this.scenePoint(x1, 0, z1),
            this.scenePoint(x1, 0, z0),
          ],
          water,
          { layer: BLOCK_LAYER.seaSurface },
        );
      }
    }

    // The wedge on the front face, between sea level and the sea floor.
    const frontZ = block.maxZM;
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i] ?? 0;
      const x1 = xs[i + 1] ?? 0;
      const e0 = Math.min(0, this.terrainElevationM(x0, frontZ));
      const e1 = Math.min(0, this.terrainElevationM(x1, frontZ));
      if (e0 === 0 && e1 === 0) {
        continue;
      }
      this.addFrontPolygon(
        [new Vector2(x0, 0), new Vector2(x1, 0), new Vector2(x1, e1), new Vector2(x0, e0)],
        water,
        BLOCK_LAYER.sectionWater,
      );
    }
  }

  // ── Framing ─────────────────────────────────────────────────────────────────

  private terrainXPositions(block: BlockBounds): number[] {
    const xs: number[] = [];
    for (let i = 0; i <= TERRAIN_COLUMNS; i++) {
      xs.push(block.minXM + ((block.maxXM - block.minXM) * i) / TERRAIN_COLUMNS);
    }
    return xs;
  }

  private terrainZPositions(block: BlockBounds): number[] {
    const zs: number[] = [];
    for (let j = 0; j <= TERRAIN_ROWS; j++) {
      zs.push(block.minZM + ((block.maxZM - block.minZM) * j) / TERRAIN_ROWS);
    }
    return zs;
  }

  /**
   * Re-solves the camera so the block fills the viewport.
   *
   * Framed against a sample of the whole block rather than its eight corners: once bent,
   * the middle of the top face bulges toward the eye and the widest point of the
   * silhouette is not a corner.
   */
  private refreshCamera(): void {
    this.cameraStale = false;

    const block = this.blockBounds();
    const points: Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const xM = block.minXM + ((block.maxXM - block.minXM) * i) / 8;
      for (let j = 0; j <= 4; j++) {
        const zM = block.minZM + ((block.maxZM - block.minZM) * j) / 4;
        points.push(this.scenePoint(xM, block.minYM, zM));
        points.push(this.scenePoint(xM, block.maxYM, zM));
      }
    }

    this.camera = SceneCamera.framing(points, { viewBounds: this.viewBounds });
    this.faceRenderer.setCamera(this.camera);
  }
}
