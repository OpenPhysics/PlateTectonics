/**
 * scripts/data/dem.ts
 *
 * Reads global elevation / bathymetry from NOAA NCEI's public
 * `DEM_mosaics/DEM_global_mosaic` ArcGIS image service and exposes it as a plain
 * grid so the build can render the relief map.
 *
 * The service returns an uncompressed, tiled, signed-16-bit GeoTIFF, so a minimal
 * TIFF reader (below) is enough — no image library is involved.
 */

import { fetchBinary } from "./fetchCache.js";

const IMAGE_SERVICE =
  "https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_global_mosaic/ImageServer/exportImage";

// TIFF tag numbers used below.
const TAG_IMAGE_WIDTH = 256;
const TAG_IMAGE_LENGTH = 257;
const TAG_BITS_PER_SAMPLE = 258;
const TAG_COMPRESSION = 259;
const TAG_TILE_WIDTH = 322;
const TAG_TILE_LENGTH = 323;
const TAG_TILE_OFFSETS = 324;
const TAG_STRIP_OFFSETS = 273;
const TAG_ROWS_PER_STRIP = 278;

/** A rectangular elevation grid in metres, north-up, equirectangular. */
export interface ElevationGrid {
  readonly width: number;
  readonly height: number;
  readonly minLon: number;
  readonly minLat: number;
  readonly maxLon: number;
  readonly maxLat: number;
  readonly values: Int16Array;
}

interface TiffField {
  readonly type: number;
  readonly count: number;
  readonly values: number[];
}

const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 8: 2, 9: 4, 11: 4, 12: 8 };

function readField(buffer: Buffer, offset: number, littleEndian: boolean): { tag: number; field: TiffField } {
  const u16 = (at: number): number => (littleEndian ? buffer.readUInt16LE(at) : buffer.readUInt16BE(at));
  const u32 = (at: number): number => (littleEndian ? buffer.readUInt32LE(at) : buffer.readUInt32BE(at));

  const tag = u16(offset);
  const type = u16(offset + 2);
  const count = u32(offset + 4);
  const size = (TYPE_SIZES[type] ?? 1) * count;
  const valueOffset = size > 4 ? u32(offset + 8) : offset + 8;

  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    if (type === 3) {
      values.push(u16(valueOffset + i * 2));
    } else if (type === 4) {
      values.push(u32(valueOffset + i * 4));
    } else if (type === 1) {
      values.push(buffer.readUInt8(valueOffset + i));
    } else {
      values.push(0);
    }
  }
  return { tag, field: { type, count, values } };
}

/** Decodes an uncompressed signed-16-bit TIFF (tiled or stripped) into a value grid. */
function decodeInt16Tiff(buffer: Buffer): { width: number; height: number; values: Int16Array } {
  const byteOrder = buffer.toString("ascii", 0, 2);
  const littleEndian = byteOrder === "II";
  if (!littleEndian && byteOrder !== "MM") {
    throw new Error("Not a TIFF file");
  }
  const u16 = (at: number): number => (littleEndian ? buffer.readUInt16LE(at) : buffer.readUInt16BE(at));
  const u32 = (at: number): number => (littleEndian ? buffer.readUInt32LE(at) : buffer.readUInt32BE(at));

  const ifdOffset = u32(4);
  const entryCount = u16(ifdOffset);
  const fields = new Map<number, TiffField>();
  for (let i = 0; i < entryCount; i++) {
    const { tag, field } = readField(buffer, ifdOffset + 2 + i * 12, littleEndian);
    fields.set(tag, field);
  }

  const first = (tag: number): number | undefined => fields.get(tag)?.values[0];
  const width = first(TAG_IMAGE_WIDTH);
  const height = first(TAG_IMAGE_LENGTH);
  if (width === undefined || height === undefined) {
    throw new Error("TIFF is missing image dimensions");
  }
  if (first(TAG_BITS_PER_SAMPLE) !== 16) {
    throw new Error(`Expected 16-bit samples, got ${first(TAG_BITS_PER_SAMPLE)}`);
  }
  if ((first(TAG_COMPRESSION) ?? 1) !== 1) {
    throw new Error("Expected an uncompressed TIFF");
  }

  const values = new Int16Array(width * height);
  const readBlock = (byteOffset: number, blockWidth: number, blockHeight: number, x0: number, y0: number): void => {
    for (let row = 0; row < blockHeight; row++) {
      const y = y0 + row;
      if (y >= height) {
        return;
      }
      const columns = Math.min(blockWidth, width - x0);
      for (let column = 0; column < columns; column++) {
        const at = byteOffset + (row * blockWidth + column) * 2;
        values[y * width + x0 + column] = littleEndian ? buffer.readInt16LE(at) : buffer.readInt16BE(at);
      }
    }
  };

  const tileOffsets = fields.get(TAG_TILE_OFFSETS);
  if (tileOffsets) {
    const tileWidth = first(TAG_TILE_WIDTH);
    const tileLength = first(TAG_TILE_LENGTH);
    if (tileWidth === undefined || tileLength === undefined) {
      throw new Error("Tiled TIFF is missing tile dimensions");
    }
    const tilesAcross = Math.ceil(width / tileWidth);
    tileOffsets.values.forEach((byteOffset, index) => {
      readBlock(
        byteOffset,
        tileWidth,
        tileLength,
        (index % tilesAcross) * tileWidth,
        Math.floor(index / tilesAcross) * tileLength,
      );
    });
    return { width, height, values };
  }

  const stripOffsets = fields.get(TAG_STRIP_OFFSETS);
  if (!stripOffsets) {
    throw new Error("TIFF has neither tiles nor strips");
  }
  const rowsPerStrip = first(TAG_ROWS_PER_STRIP) ?? height;
  stripOffsets.values.forEach((byteOffset, index) => {
    readBlock(byteOffset, width, rowsPerStrip, 0, index * rowsPerStrip);
  });
  return { width, height, values };
}

/**
 * Fetches an elevation grid covering the given geographic box.
 *
 * @param bounds - `[minLon, minLat, maxLon, maxLat]`
 * @param width - grid columns
 * @param height - grid rows
 * @param cacheName - file name for the download cache
 */
export async function fetchElevationGrid(
  bounds: readonly [number, number, number, number],
  width: number,
  height: number,
  cacheName: string,
): Promise<ElevationGrid> {
  const [minLon, minLat, maxLon, maxLat] = bounds;
  const url =
    `${IMAGE_SERVICE}?bbox=${minLon},${minLat},${maxLon},${maxLat}` +
    `&bboxSR=4326&imageSR=4326&size=${width},${height}&format=tiff&pixelType=S16&f=image`;
  const tiff = await fetchBinary(url, cacheName);
  const decoded = decodeInt16Tiff(tiff);
  if (decoded.width !== width || decoded.height !== height) {
    throw new Error(`Requested ${width}×${height} but the service returned ${decoded.width}×${decoded.height}`);
  }
  return { width, height, minLon, minLat, maxLon, maxLat, values: decoded.values };
}
