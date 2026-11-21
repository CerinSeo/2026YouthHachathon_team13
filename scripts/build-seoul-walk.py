"""Install and verify the supplied Geofabrik-derived Seoul snapshot."""

import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "staticdata"
PUBLIC = ROOT / "public/data/seoul-walk"
BOUNDARY_URL = "https://api.openstreetmap.org/api/0.6/relation/2297418/full.json"


def validate_tiles(folder):
    index = json.loads((folder / "index.json").read_bytes())
    if index["tileFormat"] != 1 or index["license"] != "ODbL 1.0":
        raise ValueError("Unexpected snapshot format or license")
    south, west, north, east = index["bbox"]
    step = index["step"]
    columns = round((east - west) / step + 0.49)
    rows = round((north - south) / step + 0.49)
    expected = {f"{x}-{y}" for x in range(columns) for y in range(rows)}
    if index["tiles"].keys() != expected:
        raise ValueError("Incomplete Seoul snapshot coverage")
    for tile, digest in index["tiles"].items():
        if not re.fullmatch(r"\d+-\d+", tile) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise ValueError("Invalid tile manifest entry")
        path = folder / f"{tile}.json"
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError(f"Tile integrity check failed: {tile}")
    return index


def stitch_rings(segments):
    rings = []
    remaining = list(segments)
    while remaining:
        ring = list(remaining.pop())
        while ring[0] != ring[-1]:
            for i, segment in enumerate(remaining):
                if segment[0] == ring[-1]:
                    ring.extend(segment[1:])
                elif segment[-1] == ring[-1]:
                    ring.extend(segment[-2::-1])
                else:
                    continue
                remaining.pop(i)
                break
            else:
                raise ValueError("Boundary ways do not form closed rings")
        rings.append(ring)
    return rings


def contains(ring, coordinate):
    x, y = coordinate
    inside = False
    for (ax, ay), (bx, by) in zip(ring, ring[1:]):
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            inside = not inside
    return inside


def install_boundary():
    request = Request(BOUNDARY_URL, headers={"User-Agent": "BingBingZero/1.0 (Seoul boundary snapshot)"})
    with urlopen(request, timeout=25) as response:
        elements = json.load(response)["elements"]
    relation = next(value for value in elements if value["type"] == "relation" and value["id"] == 2297418)
    if relation["tags"].get("admin_level") != "4" or relation["tags"].get("name:en") != "Seoul":
        raise ValueError("Unexpected Seoul boundary relation")
    ways = {value["id"]: value["nodes"] for value in elements if value["type"] == "way"}
    nodes = {value["id"]: [value["lon"], value["lat"]] for value in elements if value["type"] == "node"}
    rings = {}
    for role in ("outer", "inner"):
        members = [ways[member["ref"]] for member in relation["members"]
                   if member["role"] == role and member["type"] == "way"]
        rings[role] = [[nodes[node] for node in ring] for ring in stitch_rings(members)]
    polygons = [[outer] for outer in rings["outer"]]
    for hole in rings["inner"]:
        next(polygon for polygon in polygons if contains(polygon[0], hole[0])).append(hole)
    if not polygons or not any(contains(polygon[0], [126.978, 37.5665]) for polygon in polygons):
        raise ValueError("Seoul boundary validation failed")
    feature = {
        "type": "Feature",
        "properties": {"source": BOUNDARY_URL, "asOf": relation["timestamp"],
                       "license": "ODbL 1.0"},
        "geometry": {"type": "MultiPolygon", "coordinates": polygons},
    }
    PUBLIC.mkdir(parents=True, exist_ok=True)
    (PUBLIC / "boundary.json").write_text(json.dumps(feature, separators=(",", ":")) + "\n",
                                           encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh-boundary", action="store_true")
    args = parser.parse_args()
    if (SOURCE / "index.json").exists():
        index = validate_tiles(SOURCE)
        PUBLIC.mkdir(parents=True, exist_ok=True)
        for name in ("index.json", *(f"{tile}.json" for tile in index["tiles"])):
            shutil.copyfile(SOURCE / name, PUBLIC / name)
    if args.refresh_boundary:
        install_boundary()
    index = validate_tiles(PUBLIC)
    boundary = json.loads((PUBLIC / "boundary.json").read_bytes())
    if boundary["geometry"]["type"] != "MultiPolygon":
        raise ValueError("Invalid Seoul boundary")
    print(f"Verified {len(index['tiles'])} Seoul walking tiles and administrative boundary.")


if __name__ == "__main__":
    main()
