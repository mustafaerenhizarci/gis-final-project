import csv
import json
from pathlib import Path

import joblib
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
DATASET_PATH = ROOT / "data" / "processed" / "dataset.csv"
FEATURE_METADATA = ROOT / "data" / "processed" / "feature_columns.json"
MODEL_PATH = ROOT / "apps" / "api" / "models" / "model.joblib"
OUTPUT_PATHS = [
    ROOT / "data" / "outputs" / "risk_points.geojson",
    ROOT / "apps" / "web" / "public" / "data" / "risk_points.geojson",
]


def risk_class(score: float) -> str:
    if score >= 0.66:
        return "high"
    if score >= 0.33:
        return "medium"
    return "low"


def is_non_susceptible_surface(row: dict[str, str]) -> bool:
    land_cover = int(float(row.get("land_cover", -1)))
    return land_cover in {70, 80, 50}


def main() -> None:
    with FEATURE_METADATA.open() as file:
        feature_columns = json.load(file)["model_feature_columns"]

    model = joblib.load(MODEL_PATH)

    with DATASET_PATH.open(newline="") as file:
        rows = list(csv.DictReader(file))

    features = np.array([[float(row[column]) for column in feature_columns] for row in rows])
    if hasattr(model, "predict_proba"):
        scores = model.predict_proba(features)[:, 1]
    else:
        scores = model.predict(features)

    geojson = {
        "type": "FeatureCollection",
        "features": [],
    }

    for row, score in zip(rows, scores):
        adjusted_score = 0.0 if is_non_susceptible_surface(row) else float(score)
        longitude = float(row["longitude"])
        latitude = float(row["latitude"])
        label_column = "Label" if "Label" in row else "label"
        properties = {
            "id": row["id"],
            "Label": int(row[label_column]),
            "risk_score": round(adjusted_score, 4),
            "risk_class": risk_class(adjusted_score),
        }
        for column in feature_columns:
            properties[column] = float(row[column])

        geojson["features"].append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [longitude, latitude],
                },
                "properties": properties,
            }
        )

    for output_path in OUTPUT_PATHS:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w") as file:
            json.dump(geojson, file)
        print(f"Wrote: {output_path}")


if __name__ == "__main__":
    main()
