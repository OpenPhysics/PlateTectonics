/**
 * scripts/data/netcdf.ts
 *
 * Reads the "classic" netCDF-3 files the seafloor age grid is published in.
 *
 * The format is a big-endian header — dimensions, attributes, variables — followed
 * by each variable's values at the byte offset its header entry names, so a reader
 * that only has to serve whole non-record variables is about as small as the TIFF
 * reader next door in `dem.ts`, and saves the build a dependency on the netCDF /
 * HDF5 stack. The specification is at
 * https://docs.unidata.ucar.edu/nug/current/file_format_specifications.html.
 *
 * Only the classic format (magic `CDF\x01`) and non-record variables are handled,
 * which is what `age.2020.1.GTS2012.6m.grd` is; anything else throws rather than
 * being quietly misread.
 */

/** Header tags that introduce each list. */
const NC_DIMENSION = 0x0a;
const NC_VARIABLE = 0x0b;
const NC_ATTRIBUTE = 0x0c;

/** netCDF external data types, and how many bytes each takes. */
const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 4, 6: 8 };

/** One variable, with its values already decoded to doubles. */
export interface NetCdfVariable {
  /** Dimension names, slowest-varying first. */
  readonly dimensions: readonly string[];
  /** Length of each dimension, in the same order. */
  readonly shape: readonly number[];
  /** Values in row-major order, `_FillValue` and `missing_value` turned into NaN. */
  readonly values: Float64Array;
}

/** A whole classic-format file: its dimensions and its variables, by name. */
export interface NetCdfFile {
  readonly dimensions: ReadonlyMap<string, number>;
  readonly variables: ReadonlyMap<string, NetCdfVariable>;
}

/** Walks the header, tracking the read position. */
class Cursor {
  private readonly buffer: Buffer;
  private offset = 0;

  public constructor(buffer: Buffer) {
    this.buffer = buffer;
  }

  public int32(): number {
    const value = this.buffer.readInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  /** A counted string, padded out to a multiple of four bytes. */
  public name(): string {
    const length = this.int32();
    const text = this.buffer.toString("utf8", this.offset, this.offset + length);
    this.offset += length + padding(length);
    return text;
  }

  /** Skips one attribute's values, whose length depends on its type. */
  public skipAttributeValues(type: number, count: number): void {
    const bytes = (TYPE_SIZES[type] ?? 1) * count;
    this.offset += bytes + padding(bytes);
  }

  /** Reads one attribute value as a number, for `_FillValue` and friends. */
  public peekNumber(type: number): number {
    return readValue(this.buffer, this.offset, type);
  }
}

/** Bytes of padding that follow `length` bytes, so the next field starts on a word. */
function padding(length: number): number {
  return (4 - (length % 4)) % 4;
}

/** Reads one value of an external type as a double. */
function readValue(buffer: Buffer, offset: number, type: number): number {
  switch (type) {
    case 1:
    case 2:
      return buffer.readInt8(offset);
    case 3:
      return buffer.readInt16BE(offset);
    case 4:
      return buffer.readInt32BE(offset);
    case 5:
      return buffer.readFloatBE(offset);
    case 6:
      return buffer.readDoubleBE(offset);
    default:
      throw new Error(`Unsupported netCDF type ${type}`);
  }
}

/**
 * Reads the attribute list at the cursor, returning only the ones this reader acts
 * on: the fill values, which mark cells that carry no measurement.
 */
function readFillValues(cursor: Cursor): number[] {
  const fills: number[] = [];
  const tag = cursor.int32();
  const count = cursor.int32();
  if (tag !== NC_ATTRIBUTE) {
    // ABSENT is a zero tag followed by a zero count; both have now been consumed.
    return fills;
  }
  for (let i = 0; i < count; i++) {
    const name = cursor.name();
    const type = cursor.int32();
    const nelems = cursor.int32();
    if ((name === "_FillValue" || name === "missing_value") && nelems > 0) {
      fills.push(cursor.peekNumber(type));
    }
    cursor.skipAttributeValues(type, nelems);
  }
  return fills;
}

/** Parses a classic-format netCDF file. */
export function readNetCdf(buffer: Buffer): NetCdfFile {
  if (buffer.toString("ascii", 0, 3) !== "CDF") {
    throw new Error("Not a netCDF file");
  }
  const version = buffer.readUInt8(3);
  if (version !== 1) {
    throw new Error(`Only the classic netCDF format is supported, got version ${version}`);
  }

  const cursor = new Cursor(buffer);
  cursor.int32(); // magic
  cursor.int32(); // numrecs — there are no record variables in the grids read here

  // Dimensions, in the order the variables' dimension ids index them.
  const dimensionNames: string[] = [];
  const dimensions = new Map<string, number>();
  const dimensionTag = cursor.int32();
  const dimensionCount = cursor.int32();
  if (dimensionTag === NC_DIMENSION) {
    for (let i = 0; i < dimensionCount; i++) {
      const name = cursor.name();
      dimensionNames.push(name);
      dimensions.set(name, cursor.int32());
    }
  }

  readFillValues(cursor); // global attributes

  const variables = new Map<string, NetCdfVariable>();
  const variableTag = cursor.int32();
  const variableCount = cursor.int32();
  if (variableTag !== NC_VARIABLE) {
    return { dimensions, variables };
  }

  for (let i = 0; i < variableCount; i++) {
    const name = cursor.name();
    const rank = cursor.int32();
    const dimensionIds: number[] = [];
    for (let d = 0; d < rank; d++) {
      dimensionIds.push(cursor.int32());
    }
    const fills = readFillValues(cursor);
    const type = cursor.int32();
    cursor.int32(); // vsize, which the shape gives anyway
    const begin = cursor.int32();

    const names = dimensionIds.map((id) => dimensionNames[id] as string);
    const shape = names.map((dimension) => dimensions.get(dimension) as number);
    const length = shape.reduce((product, extent) => product * extent, 1);

    const size = TYPE_SIZES[type] as number;
    const values = new Float64Array(length);
    for (let index = 0; index < length; index++) {
      const value = readValue(buffer, begin + index * size, type);
      // A fill value means "no measurement here", which is a different thing from a
      // measurement of zero, so it is carried through as NaN.
      values[index] = Number.isNaN(value) || fills.includes(value) ? Number.NaN : value;
    }

    variables.set(name, { dimensions: names, shape, values });
  }

  return { dimensions, variables };
}
