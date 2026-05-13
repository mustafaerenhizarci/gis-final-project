# Wildfire Susceptibility GIS Decision Support System

This monorepo contains a wildfire susceptibility mapping project for the 2025 Izmir wildfire episode, focused on the Menderes-Seferihisar study area. The system combines Google Earth Engine data extraction, supervised machine learning, a FastAPI prediction service, and a React + Mapbox web GIS interface.

The application is designed for fire managers, planners, and GIS analysts who need to inspect wildfire susceptibility points, compare model outputs, and test environmental scenario changes through an interactive map.

## Project Scope

The current workflow targets the late June and early July 2025 Izmir wildfires. The main study context is the Menderes-Seferihisar fire corridor, while the wider area of interest also covers nearby affected districts such as Cesme, Buca, Gaziemir, and surrounding İzmir districts.

The Google Earth Engine workflow exports:

- `burned_points` shapefile
- `unburned_points` shapefile
- merged `samplepoints` shapefile
- `wildfire_dataset_samples.csv`

The expected academic dataset structure is:

- 500 burned points
- 500 unburned points
- 15 extracted wildfire susceptibility features
- `Label = 1` for burned points
- `Label = 0` for unburned points

## Monorepo Structure

```text
gis-final-project/
  apps/
    api/                  FastAPI prediction service
    web/                  React + Vite + Mapbox web GIS
  data/
    raw/                  GEE exports: CSV and shapefiles
    processed/            Cleaned dataset, Inputs.txt, Label.txt
    outputs/              Generated map-ready GeoJSON outputs
  docs/
    DATA_ACQUISITION.md   Step-by-step GEE usage guide
  notebooks/              Optional notebook workspace
  reports/
    figures/              Model metrics, comparison tables, reports
  scripts/
    gee/                  Google Earth Engine export scripts
    prepare_dataset.py    Cleans and prepares ML training files
    train_model.py        Trains and compares classifiers
    create_risk_geojson.py
```

## Model Features

The project uses 15 pre-fire and environmental features:

```text
elevation
slope
aspect
ndvi_before
nbr_before
ndmi_before
evi_before
land_cover
temperature
wind_speed
precipitation
soil_moisture
distance_to_water
distance_to_builtup
distance_to_cropland
```

Post-fire QA columns such as `ndvi_after`, `nbr_after`, and `dnbr` may exist in the dataset, but they are excluded from model training to avoid data leakage.

## Data Quality Rules

The preparation script filters invalid training rows before model training:

- Excludes non-susceptible land cover classes: built-up, snow/ice, and water.
- Removes `-9999` no-data values.
- Rejects physically invalid feature values.
- Balances the final training dataset by label.
- Writes a data quality report to `data/processed/data_quality_report.json`.

This is important because water or built-up points labeled as burned can produce misleading risk predictions.

## Setup

Install frontend dependencies from the repository root:

```bash
npm install
```

Create and install the backend environment:

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create the environment file:

```bash
cp .env.example .env
```

Then set your Mapbox token:

```env
VITE_MAPBOX_TOKEN=your_mapbox_token
VITE_API_BASE_URL=http://localhost:8000
```

## Data Acquisition

Use Google Earth Engine Code Editor with:

```text
scripts/gee/wildfire_features_export.js
```

Follow the detailed guide:

```text
docs/DATA_ACQUISITION.md
```

After the Earth Engine tasks finish, place the exported files in:

```text
data/raw/
```

Required CSV:

```text
data/raw/wildfire_dataset_samples.csv
```

Recommended shapefile outputs:

```text
data/raw/burned_points.*
data/raw/unburned_points.*
data/raw/samplepoints.*
```

## Run the Full Model Pipeline

From the repository root:

```bash
npm run models:run
```

This runs:

```bash
npm run data:prepare
npm run models:train
npm run risk:geojson
```

Generated outputs:

```text
data/processed/dataset.csv
data/processed/Inputs.txt
data/processed/Label.txt
data/processed/feature_columns.json
data/processed/data_quality_report.json
apps/api/models/model.joblib
reports/figures/model_metrics.json
reports/figures/model_comparison.csv
reports/figures/feature_importance.csv
data/outputs/risk_points.geojson
apps/web/public/data/risk_points.geojson
```

## Classifiers

`scripts/train_model.py` trains and compares six model runs:

```text
Random Forest baseline
Random Forest tuned
SVM baseline
SVM tuned
Logistic Regression baseline
Logistic Regression tuned
```

The script evaluates:

- Accuracy
- Precision
- Recall
- F1 score
- ROC-AUC
- Confusion matrix

The best model is selected by F1 score and ROC-AUC and saved as:

```text
apps/api/models/model.joblib
```

## Run the API

From the repository root:

```bash
npm run dev:api
```

Or manually:

```bash
cd apps/api
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Important endpoints:

```text
GET  /health
POST /predict
POST /predict-batch
```

`/predict-batch` is optimized for the web map. It receives all visible risk points, applies the model in a vectorized NumPy batch, and returns updated risk scores.

## Run the Web App

From the repository root:

```bash
npm run dev:web
```

Open:

```text
http://localhost:5173
```

Build production assets:

```bash
npm run build:web
```

Preview production build:

```bash
npm run preview:web
```

## Web GIS Features

The frontend provides:

- Mapbox-based wildfire susceptibility visualization.
- Study area polygon frame.
- Risk classes: low, medium, high.
- Incident information panel for the 2025 Izmir Menderes-Seferihisar wildfire.
- Project legend with calculation flow and data formats.
- Interactive sliders for all 15 model features.
- Debounced `/predict-batch` requests.
- Abort handling for stale slider requests.
- Point inspector showing base values, current scenario values, deltas, and risk score.

The sliders modify scenario values. For example:

```text
base temperature = 29 C
temperature delta = +5 C
API payload temperature = 34 C
```

The API receives adjusted feature values directly in `items[].features`.

## Current Limitations

The model quality depends heavily on the exported GEE dataset. If water, built-up areas, no-data pixels, or weak dNBR labels enter the training set, model metrics and map behavior will degrade.

Always inspect:

```text
data/processed/data_quality_report.json
reports/figures/model_metrics.json
reports/figures/model_comparison.csv
```

If metrics are weak, regenerate the GEE export with stricter masks or manually verified burned and unburned areas.

## Useful Commands

```bash
npm run data:prepare
npm run models:train
npm run risk:geojson
npm run models:run
npm run dev:api
npm run dev:web
npm run build:web
```
