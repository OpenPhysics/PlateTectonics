/**
 * scripts/data/contour.ts
 *
 * Marching squares: turns a scalar grid into the lines along which it takes a given
 * value. The build uses it once, to trace the isochrons of the seafloor age grid —
 * the lines of equal age that record where the ridge used to be.
 *
 * Three things about the grid it is given matter here:
 *
 *  - **Cells with no data are skipped whole.** The age grid is NaN over continental
 *    crust, so a cell with any missing corner contributes nothing and a contour
 *    simply stops at the edge of the ocean instead of being interpolated onto land.
 *  - **The seam takes care of itself.** The grid is gridline-registered from −180°
 *    to +180°, so its first and last columns are the same meridian and walking the
 *    cells between them covers the globe with no special case.
 *  - **Joining is exact.** Contours come back in grid coordinates — fractional
 *    column and row — and two neighbouring cells interpolate their shared edge from
 *    the same two corner values, so the crossing points they produce are identical
 *    to the last bit and match as map keys.
 */

/** A scalar field sampled on a regular grid, row-major, NaN where there is no data. */
export interface ScalarGrid {
  readonly width: number;
  readonly height: number;
  readonly values: Float64Array;
}

/** A traced contour, as a flat `[column, row, …]` array of grid coordinates. */
export type ContourLine = number[];

/**
 * Corner offsets from the cell's top-left grid node, `[column, row]`, numbered
 * clockwise from the top left: 0 top-left, 1 top-right, 2 bottom-right, 3
 * bottom-left. Edge *i* then joins corner *i* to corner *(i + 1) mod 4*, so edge 0
 * is the top, 1 the right, 2 the bottom and 3 the left.
 */
const CORNER_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/**
 * The two ways a saddle can be joined, as pairs of edge indices. A saddle is a cell
 * whose contour crosses all four edges, which happens when the two corners above the
 * level are diagonally opposite: the contour can either cut off the top-right and
 * bottom-left corners, or the top-left and bottom-right ones.
 */
const SADDLE_PAIRINGS: readonly (readonly (readonly [number, number])[])[] = [
  [
    [0, 1],
    [2, 3],
  ],
  [
    [1, 2],
    [3, 0],
  ],
];

/** Key for a crossing point, exact because the coordinates are computed identically. */
function pointKey(column: number, row: number): string {
  return `${column},${row}`;
}

/**
 * Traces every contour of `grid` at `level`.
 *
 * @returns one flat `[column, row, …]` array per traced line, in grid coordinates.
 * A line that closes on itself repeats its first point at the end; one that ends
 * where the data does, at a coast, does not.
 */
export function traceContours(grid: ScalarGrid, level: number): ContourLine[] {
  const { width, height, values } = grid;

  // Every segment, and an index from each of its endpoints back to it, so the
  // segments can be strung together into lines afterwards.
  const segments: [number, number, number, number][] = [];
  const atPoint = new Map<string, number[]>();

  const record = (index: number, column: number, row: number): void => {
    const key = pointKey(column, row);
    const existing = atPoint.get(key);
    if (existing) {
      existing.push(index);
    } else {
      atPoint.set(key, [index]);
    }
  };

  const corner = new Float64Array(4);

  for (let row = 0; row < height - 1; row++) {
    for (let column = 0; column < width - 1; column++) {
      let missing = false;
      for (let c = 0; c < 4; c++) {
        const offset = CORNER_OFFSETS[c] as readonly [number, number];
        const value = values[(row + offset[1]) * width + column + offset[0]] as number;
        corner[c] = value;
        missing = missing || Number.isNaN(value);
      }
      if (missing) {
        continue;
      }

      for (const [fromEdge, toEdge] of cellEdgePairs(corner, level)) {
        const [ax, ay] = edgeCrossing(corner, level, column, row, fromEdge);
        const [bx, by] = edgeCrossing(corner, level, column, row, toEdge);
        const index = segments.length;
        segments.push([ax, ay, bx, by]);
        record(index, ax, ay);
        record(index, bx, by);
      }
    }
  }

  return joinSegments(segments, atPoint);
}

/**
 * Which edges of one cell the contour runs between, as pairs of edge indices.
 *
 * An edge is crossed when its two corners sit either side of the level, which happens
 * on none of the four edges, on two of them, or — at a saddle — on all four. There is
 * no other possibility, so the only decision to make is how to pair up a saddle.
 */
function cellEdgePairs(corner: Float64Array, level: number): readonly (readonly [number, number])[] {
  const crossed: number[] = [];
  for (let edge = 0; edge < 4; edge++) {
    if ((corner[edge] as number) >= level !== (corner[(edge + 1) % 4] as number) >= level) {
      crossed.push(edge);
    }
  }
  if (crossed.length === 0) {
    return [];
  }
  if (crossed.length === 2) {
    return [[crossed[0] as number, crossed[1] as number]];
  }

  // Saddle. Reading the middle of the cell as the mean of its corners says whether the
  // two corners above the level are joined through the centre or cut off from each
  // other; the contour goes round whichever diagonal pair is isolated. Without this the
  // two branches can be paired the wrong way and cross each other.
  const middle = ((corner[0] as number) + (corner[1] as number) + (corner[2] as number) + (corner[3] as number)) / 4;
  const topLeftIsHigh = (corner[0] as number) >= level;
  const centreJoinsHighCorners = middle >= level;
  return SADDLE_PAIRINGS[topLeftIsHigh === centreJoinsHighCorners ? 0 : 1] as readonly (readonly [number, number])[];
}

/** Where the contour crosses one edge of a cell, in grid coordinates. */
function edgeCrossing(
  corner: Float64Array,
  level: number,
  column: number,
  row: number,
  edge: number,
): [number, number] {
  const to = (edge + 1) % 4;
  const fromValue = corner[edge] as number;
  const t = (level - fromValue) / ((corner[to] as number) - fromValue);
  const [fromColumn, fromRow] = CORNER_OFFSETS[edge] as readonly [number, number];
  const [toColumn, toRow] = CORNER_OFFSETS[to] as readonly [number, number];
  return [column + fromColumn + (toColumn - fromColumn) * t, row + fromRow + (toRow - fromRow) * t];
}

/**
 * Strings the segments into as few polylines as possible.
 *
 * Each segment is followed from both of its ends until it runs into a point no other
 * segment touches — the edge of the data — or back to where it started. A point where
 * more than two segments meet is left to whichever line reaches it first, which costs
 * at most one extra line.
 */
function joinSegments(
  segments: readonly [number, number, number, number][],
  atPoint: ReadonlyMap<string, number[]>,
): ContourLine[] {
  const used = new Uint8Array(segments.length);
  const lines: ContourLine[] = [];

  /** The far end of a segment, given the end being arrived at. */
  const otherEnd = (index: number, column: number, row: number): [number, number] => {
    const [ax, ay, bx, by] = segments[index] as [number, number, number, number];
    return ax === column && ay === row ? [bx, by] : [ax, ay];
  };

  /** Walks on from a point until the chain ends, appending each point reached. */
  const walk = (fromColumn: number, fromRow: number, into: ContourLine): void => {
    let column = fromColumn;
    let row = fromRow;
    for (;;) {
      const candidates = atPoint.get(pointKey(column, row));
      const next = candidates?.find((index) => used[index] === 0);
      if (next === undefined) {
        return;
      }
      used[next] = 1;
      [column, row] = otherEnd(next, column, row);
      into.push(column, row);
    }
  };

  for (let index = 0; index < segments.length; index++) {
    if (used[index] === 1) {
      continue;
    }
    used[index] = 1;
    const [ax, ay, bx, by] = segments[index] as [number, number, number, number];

    const forward: ContourLine = [bx, by];
    walk(bx, by, forward);
    const backward: ContourLine = [];
    walk(ax, ay, backward);

    // The backward half was traced away from the seed, so it goes on the front, in
    // reverse; then the seed's own two points, then the forward half.
    const line: ContourLine = [];
    for (let i = backward.length - 2; i >= 0; i -= 2) {
      line.push(backward[i] as number, backward[i + 1] as number);
    }
    line.push(ax, ay, ...forward);
    lines.push(line);
  }

  return lines;
}
