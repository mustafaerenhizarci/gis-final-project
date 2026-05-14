import csv
import json
import random
from pathlib import Path
from typing import Optional


ROOT = Path(__file__).resolve().parents[1]
RAW_CSV = ROOT / "data" / "raw" / "wildfire_dataset_samples.csv"
PROCESSED_DIR = ROOT / "data" / "processed"

FEATURE_COLUMNS = [
    "elevation",
    "slope",
    "aspect",
    "ndvi_before",
    "nbr_before",
    "ndmi_before",
    "evi_before",
    "land_cover",
    "temperature",
    "wind_speed",
    "precipitation",
    "soil_moisture",
    "distance_to_water",
    "distance_to_builtup",
    "distance_to_cropland",
]

COLUMN_ALIASES = {
    "distance_to_water": ["distance_to_water", "dist_water"],
    "distance_to_builtup": ["distance_to_builtup", "dist_built"],
    "distance_to_cropland": ["distance_to_cropland", "dist_crop"],
}

QA_COLUMNS = [
    "ndvi_after",
    "nbr_after",
    "dnbr",
]

MODEL_FEATURE_COLUMNS = FEATURE_COLUMNS

OPTIONAL_ZERO_FEATURES = set()
NON_SUSCEPTIBLE_LAND_COVER = {50, 70, 80}
NO_DATA_VALUE = -9999.0
BALANCE_SEED = 42

VALID_RANGES = {
    "elevation": (-10.0, 1500.0),
    "slope": (0.0, 60.0),
    "aspect": (0.0, 360.0),
    "ndvi_before": (-1.0, 1.0),
    "nbr_before": (-1.0, 1.0),
    "ndmi_before": (-1.0, 1.0),
    "evi_before": (-1.0, 1.0),
    "land_cover": (0.0, 100.0),
    "temperature": (0.0, 50.0),
    "wind_speed": (0.0, 25.0),
    "precipitation": (0.0, 100.0),
    "soil_moisture": (0.0, 0.6),
    "distance_to_water": (0.0, 30000.0),
    "distance_to_builtup": (0.0, 10000.0),
    "distance_to_cropland": (0.0, 10000.0),
    "ndvi_after": (-1.0, 1.0),
    "nbr_after": (-1.0, 1.0),
    "dnbr": (-2.0, 2.0),
}


def parse_coordinates(value: str) -> tuple[Optional[float], Optional[float]]:
    if not value:
        return None, None
    geometry = json.loads(value)
    coordinates = geometry.get("coordinates", [None, None])
    return coordinates[0], coordinates[1]


def to_float(value: str, column: str) -> float:
    if value == "" and column in OPTIONAL_ZERO_FEATURES:
        return 0.0
    return float(value)


def get_value(row: dict[str, str], column: str) -> str:
    for candidate in COLUMN_ALIASES.get(column, [column]):
        if candidate in row:
            return row.get(candidate, "")
    return ""


def invalid_reason(row: dict) -> Optional[str]:
    land_cover = int(round(row["land_cover"]))
    if land_cover in NON_SUSCEPTIBLE_LAND_COVER:
        return f"non_susceptible_land_cover_{land_cover}"

    for column in [*FEATURE_COLUMNS, *QA_COLUMNS]:
        value = row[column]
        if value <= NO_DATA_VALUE + 1:
            return f"no_data_{column}"
        minimum, maximum = VALID_RANGES[column]
        if value < minimum or value > maximum:
            return f"out_of_range_{column}"

    if row["longitude"] is None or row["latitude"] is None:
        return "missing_geometry"

    return None


def repair_numeric_ranges(row: dict) -> dict[str, int]:
    repairs: dict[str, int] = {}
    for column in [*FEATURE_COLUMNS, *QA_COLUMNS]:
        value = row[column]
        if value <= NO_DATA_VALUE + 1:
            continue

        minimum, maximum = VALID_RANGES[column]
        repaired = min(max(value, minimum), maximum)
        if repaired != value:
            row[column] = repaired
            repairs[column] = repairs.get(column, 0) + 1

    return repairs


def balance_by_label(rows: list[dict]) -> list[dict]:
    grouped: dict[int, list[dict]] = {0: [], 1: []}
    for row in rows:
        grouped[row["Label"]].append(row)

    if not grouped[0] or not grouped[1]:
        return rows

    target = min(len(grouped[0]), len(grouped[1]))
    rng = random.Random(BALANCE_SEED)
    balanced = []
    for label in [0, 1]:
        selected = grouped[label][:]
        rng.shuffle(selected)
        balanced.extend(selected[:target])

    balanced.sort(key=lambda item: item["id"])
    return balanced


def summarize_features(rows: list[dict]) -> dict:
    summary = {}
    for column in FEATURE_COLUMNS:
        values = [row[column] for row in rows]
        unique_values = len(set(values))
        summary[column] = {
            "min": min(values) if values else None,
            "max": max(values) if values else None,
            "unique_values": unique_values,
            "low_variance": unique_values <= 1,
        }
    return summary


def main() -> None:
    if not RAW_CSV.exists():
        raise FileNotFoundError(f"Raw CSV not found: {RAW_CSV}")

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    with RAW_CSV.open(newline="") as file:
        reader = csv.DictReader(file)
        raw_rows = list(reader)
        raw_columns = set(reader.fieldnames or [])

    label_column = "Label" if "Label" in raw_columns else "label"

    missing_required = [
        column
        for column in [*FEATURE_COLUMNS, *QA_COLUMNS]
        if not any(candidate in raw_columns for candidate in COLUMN_ALIASES.get(column, [column]))
        and column not in OPTIONAL_ZERO_FEATURES
    ]
    if missing_required:
        raise ValueError(f"Missing required columns: {missing_required}")
    if label_column not in raw_columns:
        raise ValueError("Missing required Label/label column")

    parsed_rows = []
    for index, row in enumerate(raw_rows):
        item = {
            "id": row.get("system:index") or str(index),
            "Label": int(float(row[label_column])),
        }
        for column in [*FEATURE_COLUMNS, *QA_COLUMNS]:
            value = get_value(row, column)
            item[column] = to_float(value, column)

        longitude, latitude = parse_coordinates(row.get(".geo", ""))
        item["longitude"] = longitude
        item["latitude"] = latitude
        parsed_rows.append(item)

    cleaned_rows = []
    rejected_counts: dict[str, int] = {}
    repaired_counts: dict[str, int] = {}
    for row in parsed_rows:
        for column, count in repair_numeric_ranges(row).items():
            repaired_counts[column] = repaired_counts.get(column, 0) + count

        reason = invalid_reason(row)
        if reason:
            rejected_counts[reason] = rejected_counts.get(reason, 0) + 1
            continue
        cleaned_rows.append(row)

    balanced_rows = balance_by_label(cleaned_rows)

    dataset_path = PROCESSED_DIR / "dataset.csv"
    inputs_path = PROCESSED_DIR / "Inputs.txt"
    labels_path = PROCESSED_DIR / "Label.txt"
    metadata_path = PROCESSED_DIR / "feature_columns.json"

    fieldnames = ["id", "Label", *FEATURE_COLUMNS, *QA_COLUMNS, "longitude", "latitude"]
    with dataset_path.open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(balanced_rows)

    with inputs_path.open("w", newline="") as file:
        writer = csv.writer(file)
        for row in balanced_rows:
            writer.writerow([row[column] for column in MODEL_FEATURE_COLUMNS])

    with labels_path.open("w") as file:
        for row in balanced_rows:
            file.write(f"{row['Label']}\n")

    with metadata_path.open("w") as file:
        json.dump(
            {
                "dataset_columns": fieldnames,
                "model_feature_columns": MODEL_FEATURE_COLUMNS,
                "excluded_from_model": ["ndvi_after", "nbr_after", "dnbr"],
                "exclusion_reason": "post-fire and label-derived variables would cause data leakage",
                "non_susceptible_land_cover_excluded": sorted(NON_SUSCEPTIBLE_LAND_COVER),
                "training_rows_before_balance": len(cleaned_rows),
                "training_rows_after_balance": len(balanced_rows),
                "repaired_out_of_range_values": repaired_counts,
            },
            file,
            indent=2,
        )

    label_counts = {}
    for row in balanced_rows:
        label_counts[row["Label"]] = label_counts.get(row["Label"], 0) + 1

    quality_path = PROCESSED_DIR / "data_quality_report.json"
    with quality_path.open("w") as file:
        json.dump(
            {
                "raw_rows": len(raw_rows),
                "valid_rows_before_balance": len(cleaned_rows),
                "training_rows_after_balance": len(balanced_rows),
                "label_counts": label_counts,
                "rejected_counts": rejected_counts,
                "repaired_counts": repaired_counts,
                "feature_summary": summarize_features(balanced_rows),
                "filters": {
                    "excluded_land_cover": sorted(NON_SUSCEPTIBLE_LAND_COVER),
                    "no_data_value": NO_DATA_VALUE,
                    "valid_ranges": VALID_RANGES,
                },
            },
            file,
            indent=2,
        )

    print(f"Raw rows: {len(raw_rows)}")
    print(f"Valid rows before balance: {len(cleaned_rows)}")
    print(f"Training rows after balance: {len(balanced_rows)}")
    print(f"Label counts: {label_counts}")
    print(f"Rejected counts: {rejected_counts}")
    print(f"Repaired counts: {repaired_counts}")
    print(f"Wrote: {dataset_path}")
    print(f"Wrote: {inputs_path}")
    print(f"Wrote: {labels_path}")
    print(f"Wrote: {metadata_path}")
    print(f"Wrote: {quality_path}")


if __name__ == "__main__":
    main()
