import os
from pathlib import Path

import joblib
import numpy as np

from app.schemas import FeatureVector, ScenarioParams


FEATURE_ORDER = [
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

VALID_RANGES = {
    "elevation": (-10.0, 1500.0),
    "slope": (0.0, 60.0),
    "aspect": (0.0, 360.0),
    "ndvi_before": (-1.0, 1.0),
    "nbr_before": (-1.0, 1.0),
    "ndmi_before": (-1.0, 1.0),
    "evi_before": (-1.0, 1.0),
    "land_cover": (10.0, 90.0),
    "temperature": (0.0, 50.0),
    "wind_speed": (0.0, 25.0),
    "precipitation": (0.0, 100.0),
    "soil_moisture": (0.0, 0.6),
    "distance_to_water": (0.0, 30000.0),
    "distance_to_builtup": (0.0, 10000.0),
    "distance_to_cropland": (0.0, 10000.0),
}

SCENARIO_CORRECTION_LIMIT = 0.25


class RiskModel:
    def __init__(self) -> None:
        self.model_name = "random_forest"
        self.model = self._load_model()

    def _load_model(self):
        model_path = Path(os.getenv("MODEL_PATH", "models/model.joblib"))
        if not model_path.exists():
            return None
        model = joblib.load(model_path)
        expected_features = len(FEATURE_ORDER)
        model_features = getattr(model, "n_features_in_", expected_features)
        if model_features != expected_features:
            return None
        return model

    def predict_score(self, features: FeatureVector, scenario: ScenarioParams) -> float:
        adjusted = self._sanitize_features(features)

        if int(round(adjusted.land_cover)) in {50, 70, 80}:
            return 0.0

        if self.model is None:
            return self._fallback_score(adjusted)

        row = np.array([[getattr(adjusted, name) for name in FEATURE_ORDER]])
        if hasattr(self.model, "predict_proba"):
            score = float(self.model.predict_proba(row)[0][1])
        else:
            score = float(self.model.predict(row)[0])
        return self._apply_scenario_correction(score, scenario)

    def predict_scores(self, features: list[FeatureVector], scenario: ScenarioParams) -> list[float]:
        if not features:
            return []

        adjusted_features = []
        non_susceptible_indexes = set()
        for index, feature in enumerate(features):
            adjusted = self._sanitize_features(feature)
            adjusted_features.append(adjusted)

            if int(round(adjusted.land_cover)) in {50, 70, 80}:
                non_susceptible_indexes.add(index)

        if self.model is None:
            scores = [
                0.0 if index in non_susceptible_indexes else self._fallback_score(feature)
                for index, feature in enumerate(adjusted_features)
            ]
            return self._apply_scenario_correction_array(np.array(scores), scenario, non_susceptible_indexes).tolist()

        rows = np.array([
            [getattr(feature, name) for name in FEATURE_ORDER]
            for feature in adjusted_features
        ])
        if hasattr(self.model, "predict_proba"):
            scores = self.model.predict_proba(rows)[:, 1]
        else:
            scores = self.model.predict(rows)

        return self._apply_scenario_correction_array(
            np.asarray(scores, dtype=float),
            scenario,
            non_susceptible_indexes,
        ).tolist()

    def predict_scores_from_records(self, records: list[dict], scenario=None) -> list[float]:
        if not records:
            return []

        scenario = scenario or {}
        rows = np.array(
            [
                [float(record.get(name, 0.0)) for name in FEATURE_ORDER]
                for record in records
            ],
            dtype=float,
        )

        for column_index, name in enumerate(FEATURE_ORDER):
            minimum, maximum = VALID_RANGES[name]
            rows[:, column_index] = np.clip(rows[:, column_index], minimum, maximum)
            if name == "land_cover":
                rows[:, column_index] = np.round(rows[:, column_index] / 10.0) * 10.0

        model_rows = rows.copy()
        model_rows[:, FEATURE_ORDER.index("temperature")] -= float(scenario.get("temperature_delta", 0.0))
        model_rows[:, FEATURE_ORDER.index("wind_speed")] -= float(scenario.get("wind_speed_delta", 0.0))
        model_rows[:, FEATURE_ORDER.index("precipitation")] -= float(scenario.get("precipitation_delta", 0.0))
        model_rows[:, FEATURE_ORDER.index("soil_moisture")] -= float(scenario.get("soil_moisture_delta", 0.0))
        for name in ["temperature", "wind_speed", "precipitation", "soil_moisture"]:
            column_index = FEATURE_ORDER.index(name)
            minimum, maximum = VALID_RANGES[name]
            model_rows[:, column_index] = np.clip(model_rows[:, column_index], minimum, maximum)

        land_cover = rows[:, FEATURE_ORDER.index("land_cover")]
        non_susceptible_mask = np.isin(land_cover, [50.0, 70.0, 80.0])

        if self.model is None:
            scores = np.array([
                self._fallback_score(FeatureVector(**dict(zip(FEATURE_ORDER, row))))
                for row in model_rows
            ])
        elif hasattr(self.model, "predict_proba"):
            scores = self.model.predict_proba(model_rows)[:, 1]
        else:
            scores = self.model.predict(model_rows)

        scores = np.asarray(scores, dtype=float)
        scores = self._apply_scenario_correction_array(
            scores,
            scenario,
            set(np.flatnonzero(non_susceptible_mask).tolist()),
        )
        return scores.tolist()

    def _fallback_score(self, features: FeatureVector) -> float:
        # Temporary heuristic so the API and frontend can be developed before training.
        dry_factor = max(0.0, min(1.0, 1.0 - features.precipitation / 50.0))
        heat_factor = max(0.0, min(1.0, (features.temperature - 15.0) / 30.0))
        wind_factor = max(0.0, min(1.0, features.wind_speed / 40.0))
        vegetation_factor = max(0.0, min(1.0, features.ndvi_before))
        score = 0.30 * dry_factor + 0.30 * heat_factor + 0.25 * wind_factor + 0.15 * vegetation_factor
        return round(max(0.0, min(1.0, score)), 4)

    def _sanitize_features(self, features: FeatureVector) -> FeatureVector:
        clean = features.model_copy(deep=True)
        for name, (minimum, maximum) in VALID_RANGES.items():
            value = getattr(clean, name)
            value = min(max(value, minimum), maximum)
            if name == "land_cover":
                value = round(value / 10) * 10
            setattr(clean, name, value)
        return clean

    def _scenario_adjustment(self, scenario) -> float:
        if isinstance(scenario, ScenarioParams):
            temperature_delta = scenario.temperature_delta
            wind_speed_delta = scenario.wind_speed_delta
            precipitation_delta = scenario.precipitation_delta
            soil_moisture_delta = scenario.soil_moisture_delta
        else:
            temperature_delta = float(scenario.get("temperature_delta", 0.0))
            wind_speed_delta = float(scenario.get("wind_speed_delta", 0.0))
            precipitation_delta = float(scenario.get("precipitation_delta", 0.0))
            soil_moisture_delta = float(scenario.get("soil_moisture_delta", 0.0))

        adjustment = (
            0.018 * temperature_delta
            + 0.025 * wind_speed_delta
            - 0.010 * precipitation_delta
            - 1.200 * soil_moisture_delta
        )
        return float(np.clip(adjustment, -SCENARIO_CORRECTION_LIMIT, SCENARIO_CORRECTION_LIMIT))

    def _apply_scenario_correction(self, score: float, scenario) -> float:
        corrected = score + self._scenario_adjustment(scenario)
        return float(np.clip(corrected, 0.0, 1.0))

    def _apply_scenario_correction_array(
        self,
        scores: np.ndarray,
        scenario,
        non_susceptible_indexes: set[int],
    ) -> np.ndarray:
        corrected = np.clip(scores + self._scenario_adjustment(scenario), 0.0, 1.0)
        if non_susceptible_indexes:
            corrected[list(non_susceptible_indexes)] = 0.0
        return corrected


def risk_class(score: float) -> str:
    if score >= 0.66:
        return "high"
    if score >= 0.33:
        return "medium"
    return "low"
