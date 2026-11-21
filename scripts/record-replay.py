"""Normalize the open-data forecasts used by the three dated demos."""

import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parent.parent
DESTINATION = ROOT / "public/data/weather"
TILES = ("5-4", "6-4", "6-5", "7-1", "7-2", "7-4", "7-5", "8-1", "8-2")
ENDPOINT = "https://historical-forecast-api.open-meteo.com/v1/forecast"
MODEL = "ecmwf_aifs025_single"
SELECTED = datetime(2026, 2, 2, 4, tzinfo=timezone.utc)


def to_iso(timestamp):
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat().replace("+00:00", "Z")


def main():
    index = json.loads((ROOT / "public/data/seoul-walk/index.json").read_bytes())
    south, west, *_ = index["bbox"]
    step = index["step"]
    points = []
    for tile in TILES:
        column, row = map(int, tile.split("-"))
        points.append([round(west + (column + 0.5) * step, 6), round(south + (row + 0.5) * step, 6)])
    url = ENDPOINT + "?" + urlencode({
        "longitude": ",".join(str(point[0]) for point in points),
        "latitude": ",".join(str(point[1]) for point in points),
        "hourly": "temperature_2m,precipitation,snowfall", "timezone": "GMT",
        "timeformat": "unixtime", "start_date": "2026-02-01", "end_date": "2026-02-02",
        "models": MODEL,
    })
    records = json.loads(subprocess.check_output(
        ["curl", "-fsS", "--compressed", "--retry", "2", "--max-time", "15", url]))
    selected = SELECTED.timestamp()
    queried_at = to_iso(datetime.now(timezone.utc).timestamp())
    series = []
    for point, record in zip(points, records, strict=True):
        hourly = record["hourly"]
        hours = [
            {"valid_at": to_iso(timestamp), "temperature_c": hourly["temperature_2m"][i],
             "precipitation_mm": hourly["precipitation"][i], "snowfall_cm": hourly["snowfall"][i]}
            for i, timestamp in enumerate(hourly["time"]) if selected - 5 * 3600 <= timestamp <= selected
        ]
        if len(hours) != 6 or any(hour["temperature_c"] is None or hour["precipitation_mm"] is None for hour in hours):
            raise ValueError("Incomplete historical forecast")
        series.append({
            "provider": "open-meteo", "model": MODEL, "location": {"coordinates": point},
            "mode": "historical_replay", "selected_at": to_iso(selected), "issued_at": None,
            "queried_at": queried_at, "hours": hours, "data_state": "HISTORICAL_REPLAY",
        })
    archive = {
        "license": "https://creativecommons.org/licenses/by/4.0/",
        "source": "Open-Meteo Historical Forecast / ECMWF AIFS",
        "source_url": url,
        "processing": "Extracted temperature, precipitation and snowfall for six selected hourly times. UTC timestamps.",
        "series": series,
    }
    data = (json.dumps(archive, separators=(",", ":")) + "\n").encode()
    DESTINATION.mkdir(parents=True, exist_ok=True)
    (DESTINATION / "aifs-20260202.json").write_bytes(data)
    (DESTINATION / "aifs-20260202.sha256").write_text(hashlib.sha256(data).hexdigest() + "\n", encoding="ascii")
    print(f"Recorded {len(series)} public archived forecast series.")


if __name__ == "__main__":
    main()
