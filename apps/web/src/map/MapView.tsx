import { useEffect, useRef, useState } from "react";
import mapboxgl, { GeoJSONSource } from "mapbox-gl";
import { predictBatch } from "../api/client";
import { ScenarioState } from "../components/ControlPanel";
import { adjustFeatureValue, FEATURE_CONFIGS, MODEL_FEATURES } from "../features";

type Props = {
  scenario: ScenarioState;
};

const STUDY_AREA_CENTER: [number, number] = [27.0, 38.11];
const RISK_SOURCE_ID = "risk-points";
const RISK_LAYER_ID = "risk-points-layer";
const STUDY_AREA_SOURCE_ID = "study-area";
const STUDY_AREA_FILL_LAYER_ID = "study-area-fill";
const STUDY_AREA_LINE_LAYER_ID = "study-area-line";
const SCENARIO_DEBOUNCE_MS = 350;

type RiskStats = {
  total: number;
  averageRisk: number;
  low: number;
  medium: number;
  high: number;
  status: "loading" | "ready" | "updating" | "error";
};

type PointFeature = {
  id?: string | number;
  Label?: number;
  risk_score?: number;
  risk_class?: string;
  [key: string]: string | number | undefined;
};

type PointComparison = {
  id: string;
  label: number | null;
  baseRiskScore: number;
  riskScore: number;
  baseRiskClass: string;
  riskClass: string;
  changes: Array<{
    name: string;
    unit: string;
    base: number;
    adjusted: number;
    delta: number;
  }>;
};

const EMPTY_STATS: RiskStats = {
  total: 0,
  averageRisk: 0,
  low: 0,
  medium: 0,
  high: 0,
  status: "loading"
};

function getRiskClass(score: number) {
  if (score >= 0.66) {
    return "high";
  }
  if (score >= 0.33) {
    return "medium";
  }
  return "low";
}

function calculateStats(data: GeoJSON.FeatureCollection, status: RiskStats["status"]): RiskStats {
  const scores = data.features.map((feature) => Number(feature.properties?.risk_score ?? 0));
  const total = scores.length;
  const averageRisk = total ? scores.reduce((sum, score) => sum + score, 0) / total : 0;
  const counts = scores.reduce(
    (result, score) => {
      result[getRiskClass(score)] += 1;
      return result;
    },
    { low: 0, medium: 0, high: 0 }
  );

  return {
    total,
    averageRisk,
    low: counts.low,
    medium: counts.medium,
    high: counts.high,
    status
  };
}

function formatFeatureValue(value: number, unit: string) {
  const formatted = Math.abs(value) < 1 && value !== 0 ? value.toFixed(3) : String(value);
  return `${formatted}${unit ? ` ${unit}` : ""}`;
}

function buildPointComparison(
  baseFeature: GeoJSON.Feature<GeoJSON.Geometry, PointFeature> | undefined,
  currentFeature: GeoJSON.Feature<GeoJSON.Geometry, PointFeature> | undefined,
  scenario: ScenarioState
): PointComparison | null {
  if (!currentFeature?.properties) {
    return null;
  }

  const currentProperties = currentFeature.properties;
  const baseProperties = baseFeature?.properties ?? currentProperties;
  const id = String(currentProperties.id ?? baseProperties.id ?? "-");

  return {
    id,
    label: typeof currentProperties.Label === "number" ? currentProperties.Label : null,
    baseRiskScore: Number(baseProperties.risk_score ?? 0),
    riskScore: Number(currentProperties.risk_score ?? 0),
    baseRiskClass: String(baseProperties.risk_class ?? "-"),
    riskClass: String(currentProperties.risk_class ?? "-"),
    changes: FEATURE_CONFIGS.map((feature) => {
      const base = Number(baseProperties[feature.name] ?? 0);
      const adjusted = Number(
        currentProperties[feature.name] ?? adjustFeatureValue(feature.name, base, scenario[feature.name])
      );
      return {
        name: feature.label,
        unit: feature.unit,
        base,
        adjusted,
        delta: adjusted - base
      };
    })
  };
}

function formatStatus(status: RiskStats["status"]) {
  if (status === "loading") {
    return "Loading risk layer";
  }
  if (status === "updating") {
    return "Updating scenario";
  }
  if (status === "error") {
    return "API update failed";
  }
  return "Ready";
}

function statusTone(status: RiskStats["status"]) {
  if (status === "error") {
    return "bg-red-500";
  }
  if (status === "updating" || status === "loading") {
    return "bg-amber-500";
  }
  return "bg-emerald-500";
}

function createStudyAreaPolygon(data: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  const coordinates = data.features
    .map((feature) => feature.geometry)
    .filter((geometry): geometry is GeoJSON.Point => geometry?.type === "Point")
    .map((geometry) => geometry.coordinates);

  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const longitudePadding = Math.max((maxLongitude - minLongitude) * 0.08, 0.01);
  const latitudePadding = Math.max((maxLatitude - minLatitude) * 0.08, 0.01);

  const west = minLongitude - longitudePadding;
  const east = maxLongitude + longitudePadding;
  const south = minLatitude - latitudePadding;
  const north = maxLatitude + latitudePadding;

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: "Izmir Menderes-Seferihisar study area"
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [west, south],
              [east, south],
              [east, north],
              [west, north],
              [west, south]
            ]
          ]
        }
      }
    ]
  };
}

function fitToStudyArea(map: mapboxgl.Map, area: GeoJSON.FeatureCollection) {
  const polygon = area.features[0]?.geometry;
  if (polygon?.type !== "Polygon") {
    return;
  }

  const bounds = new mapboxgl.LngLatBounds();
  polygon.coordinates[0].forEach(([longitude, latitude]) => {
    bounds.extend([longitude, latitude]);
  });
  map.fitBounds(bounds, { padding: 70, duration: 0 });
}

export function MapView({ scenario }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const baseDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const dataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const scenarioRef = useRef(scenario);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [stats, setStats] = useState<RiskStats>(EMPTY_STATS);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<PointComparison | null>(null);

  useEffect(() => {
    scenarioRef.current = scenario;
  }, [scenario]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mustafaerenhizarci/cmp5r4l2w004e01s7fx0743ch",
      center: STUDY_AREA_CENTER,
      zoom: 9,
      pitch: 35
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl(), "bottom-right");

    mapRef.current.on("load", async () => {
      try {
        setStats((current) => ({ ...current, status: "loading" }));
        const response = await fetch("/data/risk_points.geojson");
        if (!response.ok) {
          throw new Error("Risk GeoJSON could not be loaded");
        }

        const data = (await response.json()) as GeoJSON.FeatureCollection;
        baseDataRef.current = data;
        dataRef.current = data;
        const studyArea = createStudyAreaPolygon(data);

        mapRef.current?.addSource(STUDY_AREA_SOURCE_ID, {
          type: "geojson",
          data: studyArea
        });

        mapRef.current?.addLayer({
          id: STUDY_AREA_FILL_LAYER_ID,
          type: "fill",
          source: STUDY_AREA_SOURCE_ID,
          paint: {
            "fill-color": "#f5d36d",
            "fill-opacity": 0.08
          }
        });

        mapRef.current?.addLayer({
          id: STUDY_AREA_LINE_LAYER_ID,
          type: "line",
          source: STUDY_AREA_SOURCE_ID,
          paint: {
            "line-color": "#f5d36d",
            "line-width": 3,
            "line-opacity": 0.92,
            "line-dasharray": [2, 1]
          }
        });

        mapRef.current?.addSource(RISK_SOURCE_ID, {
          type: "geojson",
          data
        });

        mapRef.current?.addLayer({
          id: RISK_LAYER_ID,
          type: "circle",
          source: RISK_SOURCE_ID,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 4, 12, 9],
            "circle-color": ["step", ["get", "risk_score"], "#2f8f46", 0.33, "#f2c94c", 0.66, "#d9472f"],
            "circle-opacity": 0.76,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#ffffff"
          }
        });

        if (mapRef.current) {
          mapRef.current.on("click", RISK_LAYER_ID, (event) => {
            const feature = event.features?.[0];
            const properties = feature?.properties ?? {};
            const id = String(properties.id ?? "-");
            setSelectedPointId(id);

            const baseFeature = baseDataRef.current?.features.find((item) => String(item.properties?.id ?? "-") === id);
            const currentFeature = dataRef.current?.features.find((item) => String(item.properties?.id ?? "-") === id);
            setSelectedPoint(
              buildPointComparison(
                baseFeature as GeoJSON.Feature<GeoJSON.Geometry, PointFeature> | undefined,
                currentFeature as GeoJSON.Feature<GeoJSON.Geometry, PointFeature> | undefined,
                scenarioRef.current
              )
            );
          });

          mapRef.current.on("mouseenter", RISK_LAYER_ID, () => {
            mapRef.current!.getCanvas().style.cursor = "pointer";
          });

          mapRef.current.on("mouseleave", RISK_LAYER_ID, () => {
            mapRef.current!.getCanvas().style.cursor = "";
          });

          fitToStudyArea(mapRef.current, studyArea);
        }

        setStats(calculateStats(data, "ready"));
      } catch (error) {
        console.error(error);
        setStats((current) => ({ ...current, status: "error" }));
      }
    });
  }, []);

  useEffect(() => {
    const baseData = baseDataRef.current;
    const map = mapRef.current;
    if (!baseData || !map?.getSource(RISK_SOURCE_ID)) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const updateLayer = async () => {
      setStats((current) => ({ ...current, status: "updating" }));
      const items = baseData.features.map((feature) => {
        const properties = feature.properties ?? {};
        return {
          id: String(properties.id),
          features: Object.fromEntries(
            MODEL_FEATURES.map((name) => [
              name,
              adjustFeatureValue(name, Number(properties[name] ?? 0), scenario[name])
            ])
          )
        };
      });

      const result = await predictBatch(
        items,
        {
          temperature_delta: scenario.temperature,
          wind_speed_delta: scenario.wind_speed,
          precipitation_delta: scenario.precipitation,
          soil_moisture_delta: scenario.soil_moisture
        },
        { signal: abortController.signal }
      );

      if (requestId !== requestIdRef.current || abortController.signal.aborted) {
        return;
      }

      const scores = new Map(result.items.map((item) => [item.id, item]));
      const updated = {
        ...baseData,
        features: baseData.features.map((feature) => {
          const properties = feature.properties ?? {};
          const prediction = scores.get(String(properties.id));
          const updatedFeatures = {
            ...properties,
            ...Object.fromEntries(
              MODEL_FEATURES.map((name) => [
                name,
                adjustFeatureValue(name, Number(properties[name] ?? 0), scenario[name])
              ])
            )
          };

          return {
            ...feature,
            properties: {
              ...updatedFeatures,
              risk_score: prediction?.risk_score ?? properties.risk_score,
              risk_class: prediction?.risk_class ?? properties.risk_class
            }
          } as GeoJSON.Feature<GeoJSON.Geometry, PointFeature>;
        })
      };

      dataRef.current = updated;
      (map.getSource(RISK_SOURCE_ID) as GeoJSONSource).setData(updated);
      if (selectedPointId) {
        const baseFeature = baseData.features.find((feature) => String(feature.properties?.id ?? "-") === selectedPointId);
        const matched = updated.features.find((feature) => String(feature.properties?.id ?? "-") === selectedPointId);
        setSelectedPoint(
          buildPointComparison(
            baseFeature as GeoJSON.Feature<GeoJSON.Geometry, PointFeature> | undefined,
            matched as GeoJSON.Feature<GeoJSON.Geometry, PointFeature> | undefined,
            scenario
          )
        );
      }
      setStats(calculateStats(updated, "ready"));
    };

    const debounceTimer = window.setTimeout(() => {
      updateLayer().catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        if (requestId !== requestIdRef.current) {
          return;
        }
        console.error(error);
        setStats((current) => ({ ...current, status: "error" }));
      });
    }, SCENARIO_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(debounceTimer);
      abortController.abort();
    };
  }, [scenario]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const isLoading = stats.status === "loading";
  const isUpdating = stats.status === "updating";

  return (
    <>
      <div ref={containerRef} className="map-container" />
      {(isLoading || isUpdating) && (
        <div className="pointer-events-none absolute inset-x-4 top-1/2 z-20 mx-auto flex max-w-sm -translate-y-1/2 items-center gap-3 rounded-lg border border-white/35 bg-white/92 px-4 py-3 text-sm font-semibold text-slate-800 shadow-2xl shadow-black/25 backdrop-blur-md">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-700" />
          {isLoading ? "Loading map risk data" : "Updating risk scores"}
        </div>
      )}

      <section
        className="absolute right-4 top-4 z-10 grid w-[min(380px,calc(100vw-32px))] gap-4 rounded-lg border border-white/30 bg-white/90 p-5 text-slate-900 shadow-2xl shadow-black/25 backdrop-blur-md sm:right-5 sm:top-5"
        aria-label="Risk statistics"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Study Area</p>
            <h2 className="mt-1 text-xl font-bold leading-tight text-slate-950">Risk Overview</h2>
            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-xs font-semibold text-slate-600">
              <span className={`h-2 w-2 rounded-full ${statusTone(stats.status)} ${isLoading || isUpdating ? "animate-pulse" : ""}`} />
              {formatStatus(stats.status)}
            </div>
          </div>
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full border border-emerald-200 bg-emerald-50 text-2xl font-black text-emerald-800 shadow-inner">
            {isLoading ? <span className="h-8 w-12 animate-pulse rounded bg-emerald-200" /> : `${Math.round(stats.averageRisk * 100)}%`}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Points", stats.total, "text-slate-950", "bg-slate-50"],
            ["High", stats.high, "text-red-700", "bg-red-50"],
            ["Medium", stats.medium, "text-amber-700", "bg-amber-50"],
            ["Low", stats.low, "text-emerald-700", "bg-emerald-50"]
          ].map(([label, value, textClass, bgClass]) => (
            <div
              className={`grid min-h-16 content-center gap-1 rounded-md border border-slate-200/80 ${bgClass} px-2 py-2 text-center`}
              key={label}
            >
              {isLoading ? <span className="mx-auto h-5 w-8 animate-pulse rounded bg-slate-200" /> : <strong className={`text-lg leading-none ${textClass}`}>{value}</strong>}
              <span className="text-[11px] font-semibold text-slate-500">{label}</span>
            </div>
          ))}
        </div>

        <div className="grid gap-2">
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
            <i className="block bg-emerald-600 transition-all" style={{ width: `${stats.total ? (stats.low / stats.total) * 100 : 0}%` }} />
            <i className="block bg-amber-400 transition-all" style={{ width: `${stats.total ? (stats.medium / stats.total) * 100 : 0}%` }} />
            <i className="block bg-red-600 transition-all" style={{ width: `${stats.total ? (stats.high / stats.total) * 100 : 0}%` }} />
          </div>
          {isLoading && <div className="h-3 animate-pulse rounded-full bg-slate-200" />}
        </div>

        <div className="flex flex-wrap gap-3 text-xs font-bold text-slate-600">
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> Low</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Medium</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-red-600" /> High</span>
        </div>
      </section>

      <section
        className="absolute bottom-4 right-4 z-10 grid w-[min(380px,calc(100vw-32px))] gap-3 rounded-lg border border-white/30 bg-white/92 p-5 text-slate-900 shadow-2xl shadow-black/25 backdrop-blur-md sm:bottom-5 sm:right-5"
        aria-label="Point inspector"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Point Inspector</p>
            <h3 className="mt-1 text-lg font-bold text-slate-950">Selected feature values</h3>
          </div>
          <button
            className="rounded-md border border-slate-200 bg-white/80 px-2.5 py-1 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
            type="button"
            onClick={() => {
              setSelectedPoint(null);
              setSelectedPointId(null);
            }}
          >
            Clear
          </button>
        </div>

        {selectedPoint ? (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <span className="block text-slate-500">Point ID</span>
                <span className="text-slate-900">{String(selectedPoint.id ?? "-")}</span>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <span className="block text-slate-500">Label</span>
                <span className="text-slate-900">{selectedPoint.label === null ? "-" : selectedPoint.label}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <span className="block text-slate-500">Base risk</span>
                <span className="text-slate-900">{selectedPoint.baseRiskClass} ({Math.round(selectedPoint.baseRiskScore * 100)}%)</span>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <span className="block text-slate-500">Current risk</span>
                <span className="text-slate-900">{selectedPoint.riskClass} ({Math.round(selectedPoint.riskScore * 100)}%)</span>
              </div>
            </div>
            <div className="max-h-52 overflow-y-auto rounded-md border border-slate-200 bg-white/80">
              {selectedPoint.changes.map((feature) => (
                <div className="grid gap-1 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0" key={feature.name}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-700">{feature.name}</span>
                    <span className={`text-xs font-bold ${feature.delta === 0 ? "text-slate-400" : "text-emerald-700"}`}>
                      {feature.delta >= 0 ? "+" : ""}
                      {formatFeatureValue(feature.delta, feature.unit)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <span className="rounded bg-slate-50 px-2 py-1 text-slate-500">Base: {formatFeatureValue(feature.base, feature.unit)}</span>
                    <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-800">Current: {formatFeatureValue(feature.adjusted, feature.unit)}</span>
                    <span className="rounded bg-slate-50 px-2 py-1 text-slate-500">
                      Delta: {feature.delta >= 0 ? "+" : ""}
                      {formatFeatureValue(feature.delta, feature.unit)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm leading-5 text-slate-600">
            Click any point on the map to inspect the original values, the adjusted scenario values, and the resulting risk score.
          </p>
        )}
      </section>
    </>
  );
}
