export type ModelFeatureName =
  | "elevation"
  | "slope"
  | "aspect"
  | "ndvi_before"
  | "nbr_before"
  | "ndmi_before"
  | "evi_before"
  | "land_cover"
  | "temperature"
  | "wind_speed"
  | "precipitation"
  | "soil_moisture"
  | "distance_to_water"
  | "distance_to_builtup"
  | "distance_to_cropland";

export type FeatureAdjustments = Record<ModelFeatureName, number>;

export type FeatureConfig = {
  name: ModelFeatureName;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  group: string;
  valueMin: number;
  valueMax: number;
  categorical?: boolean;
};

export const MODEL_FEATURES: ModelFeatureName[] = [
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
  "distance_to_cropland"
];

export const FEATURE_CONFIGS: FeatureConfig[] = [
  { name: "elevation", label: "Elevation", unit: "m", min: -100, max: 100, step: 10, group: "Topography", valueMin: 0, valueMax: 1500 },
  { name: "slope", label: "Slope", unit: "deg", min: -10, max: 10, step: 1, group: "Topography", valueMin: 0, valueMax: 60 },
  { name: "aspect", label: "Aspect", unit: "deg", min: -90, max: 90, step: 15, group: "Topography", valueMin: 0, valueMax: 360 },
  { name: "ndvi_before", label: "NDVI before", unit: "", min: -0.2, max: 0.2, step: 0.02, group: "Vegetation", valueMin: -1, valueMax: 1 },
  { name: "nbr_before", label: "NBR before", unit: "", min: -0.2, max: 0.2, step: 0.02, group: "Vegetation", valueMin: -1, valueMax: 1 },
  { name: "ndmi_before", label: "NDMI before", unit: "", min: -0.2, max: 0.2, step: 0.02, group: "Vegetation", valueMin: -1, valueMax: 1 },
  { name: "evi_before", label: "EVI before", unit: "", min: -0.2, max: 0.2, step: 0.02, group: "Vegetation", valueMin: -1, valueMax: 1 },
  { name: "land_cover", label: "Land cover", unit: "class", min: -20, max: 20, step: 10, group: "Land Use", valueMin: 10, valueMax: 90, categorical: true },
  { name: "temperature", label: "Temperature", unit: "C", min: -5, max: 10, step: 1, group: "Climate", valueMin: 0, valueMax: 50 },
  { name: "wind_speed", label: "Wind speed", unit: "m/s", min: -2, max: 5, step: 0.5, group: "Climate", valueMin: 0, valueMax: 25 },
  { name: "precipitation", label: "Precipitation", unit: "mm", min: -5, max: 10, step: 1, group: "Climate", valueMin: 0, valueMax: 100 },
  { name: "soil_moisture", label: "Soil moisture", unit: "", min: -0.05, max: 0.05, step: 0.005, group: "Climate", valueMin: 0, valueMax: 0.6 },
  { name: "distance_to_water", label: "Distance to water", unit: "m", min: -2000, max: 2000, step: 100, group: "Distance", valueMin: 0, valueMax: 30000 },
  { name: "distance_to_builtup", label: "Distance to built-up", unit: "m", min: -1000, max: 1000, step: 100, group: "Distance", valueMin: 0, valueMax: 10000 },
  { name: "distance_to_cropland", label: "Distance to cropland", unit: "m", min: -1000, max: 1000, step: 100, group: "Distance", valueMin: 0, valueMax: 10000 }
];

export const DEFAULT_FEATURE_ADJUSTMENTS = Object.fromEntries(
  MODEL_FEATURES.map((feature) => [feature, 0])
) as FeatureAdjustments;

export function adjustFeatureValue(name: ModelFeatureName, baseValue: number, delta: number) {
  const config = FEATURE_CONFIGS.find((feature) => feature.name === name);
  if (!config) {
    return baseValue + delta;
  }

  const adjusted = Math.min(config.valueMax, Math.max(config.valueMin, baseValue + delta));
  if (config.categorical) {
    return Math.round(adjusted / 10) * 10;
  }
  return adjusted;
}
