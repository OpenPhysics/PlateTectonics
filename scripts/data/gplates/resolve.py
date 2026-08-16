#!/usr/bin/env python3
"""
scripts/data/gplates/resolve.py

Resolves a GPlates plate-motion model into the two things the Deep Time screen
needs, and writes them to one JSON file for `scripts/build-data.ts` to reshape.

Run through `scripts/data/gplates.ts`, which owns the virtualenv and the download;
it is not meant to be run by hand.

    resolve.py <model-dir> <out.json> <end-ma> <step-ma>

── Why two different kinds of output ─────────────────────────────────────────
A *static* feature — a coastline — is cookie-cut by plate ID and reconstructs as
one rigid rotation of its present-day geometry. It therefore needs no per-time
geometry at all: a table of finite rotations per plate ID is enough, and the
runtime can interpolate between samples so continents glide rather than jump.

A *topology* — a plate polygon, a plate boundary — has no present-day geometry to
rotate. It is rebuilt at every instant from whichever moving boundary features
happen to bound it then, and both its shape and the number of plates change as
ridges and trenches are born and die. That genuinely has to be baked per time step.

So: `rotations` + `coastlines` drive continuous motion, `snapshots` are stepped.
"""

import glob
import json
import os
import sys

import pygplates

# GPlates feature types → the three kinds of boundary taught in an introductory
# course. Everything not named here is a boundary the model draws for its own
# bookkeeping (terrane edges, slab edges, unclassified) and is not drawn.
BOUNDARY_TYPES = {
    "MidOceanRidge": "divergent",
    "ContinentalRift": "divergent",
    "ExtendedContinentalCrust": "divergent",
    "SubductionZone": "convergent",
    "ContinentalCollision": "convergent",
    "OrogenicBelt": "convergent",
    "Transform": "transform",
}


def flat(geometry):
    """A pygplates geometry as a flat [lon, lat, lon, lat, …] list of degrees."""
    out = []
    for point in geometry:
        lat, lon = point.to_lat_lon()
        out.append(lon)
        out.append(lat)
    return out


def resolve_snapshot(topology_features, rotation_model, time):
    """Plate polygons and classified boundary lines as they stood at `time`."""
    resolved = []
    shared_sections = []
    pygplates.resolve_topologies(
        topology_features, rotation_model, resolved, time, shared_sections
    )

    plates = []
    for topology in resolved:
        feature = topology.get_feature()
        # A rigid plate is a ResolvedTopologicalBoundary; a ResolvedTopologicalNetwork
        # is a deforming belt — an orogen or a rift — where the model explicitly does
        # not treat the lithosphere as rigid. Both are drawn, told apart by this flag,
        # because the difference is one of the things the screen is there to show.
        deforming = isinstance(topology, pygplates.ResolvedTopologicalNetwork)
        boundary = topology.get_resolved_boundary()
        if boundary is None:
            continue
        plates.append(
            {
                "id": feature.get_reconstruction_plate_id(),
                "name": feature.get_name(""),
                "deforming": deforming,
                "ring": flat(boundary),
            }
        )

    boundaries = []
    for section in shared_sections:
        type_name = str(section.get_feature().get_feature_type()).split(":")[-1]
        kind = BOUNDARY_TYPES.get(type_name)
        if kind is None:
            continue
        # Shared sub-segments, so a boundary shared by two plates is emitted once.
        for sub_segment in section.get_shared_sub_segments():
            coords = flat(sub_segment.get_resolved_geometry())
            if len(coords) >= 4:
                boundaries.append({"type": kind, "coords": coords})

    return {"time": time, "plates": plates, "boundaries": boundaries}


def build_rotation_table(rotation_model, plate_ids, times):
    """
    Absolute finite rotation of each plate ID at each sample time, as
    [poleLat, poleLon, angleDegrees].

    These are *total* reconstruction rotations from present day, relative to the
    anchor plate, so applying one to present-day geometry lands it where it was.
    The runtime interpolates between consecutive samples.
    """
    table = {}
    for plate_id in sorted(plate_ids):
        samples = []
        for time in times:
            rotation = rotation_model.get_rotation(
                time, plate_id, anchor_plate_id=0
            )
            if rotation.represents_identity_rotation():
                samples.append([0.0, 0.0, 0.0])
                continue
            pole, angle_radians = rotation.get_euler_pole_and_angle()
            lat, lon = pole.to_lat_lon()
            samples.append([lat, lon, angle_radians * 180.0 / 3.141592653589793])
        table[str(plate_id)] = samples
    return table


def main():
    model_dir, out_path, end_ma, step_ma = (
        sys.argv[1],
        sys.argv[2],
        float(sys.argv[3]),
        float(sys.argv[4]),
    )

    rot_files = sorted(glob.glob(os.path.join(model_dir, "*.rot")))
    gpml_files = sorted(glob.glob(os.path.join(model_dir, "*.gpml")))
    if not rot_files or not gpml_files:
        raise SystemExit(f"No .rot/.gpml files under {model_dir}")

    rotation_model = pygplates.RotationModel(rot_files)
    topology_features = [pygplates.FeatureCollection(f) for f in gpml_files]

    times = [
        round(i * step_ma, 3) for i in range(int(round(end_ma / step_ma)) + 1)
    ]

    snapshots = []
    for time in times:
        snapshots.append(resolve_snapshot(topology_features, rotation_model, time))
        print(
            f"  {time:6.1f} Ma  {len(snapshots[-1]['plates']):3d} plates"
            f"  {len(snapshots[-1]['boundaries']):4d} boundary segments",
            file=sys.stderr,
        )

    coastline_path = os.path.join(
        model_dir,
        "StaticGeometries",
        "Coastlines",
        "Global_coastlines_2019_v1_low_res.shp",
    )
    coastlines = []
    plate_ids = set()
    for feature in pygplates.FeatureCollection(coastline_path):
        plate_id = feature.get_reconstruction_plate_id()
        plate_ids.add(plate_id)
        for geometry in feature.get_geometries():
            coords = flat(geometry)
            if len(coords) >= 6:
                coastlines.append({"plateId": plate_id, "coords": coords})

    payload = {
        "model": os.path.basename(model_dir.rstrip("/")),
        "times": times,
        "snapshots": snapshots,
        "coastlines": coastlines,
        "rotations": build_rotation_table(rotation_model, plate_ids, times),
    }

    with open(out_path, "w", encoding="utf8") as handle:
        json.dump(payload, handle)
    print(f"  wrote {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
