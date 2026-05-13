import { useState } from "react";

const modelFeatures = [
  "Elevation",
  "Slope",
  "Aspect",
  "NDVI before fire",
  "NBR before fire",
  "NDMI before fire",
  "EVI before fire",
  "Land cover",
  "Temperature",
  "Wind speed",
  "Precipitation",
  "Soil moisture",
  "Distance to water",
  "Distance to built-up",
  "Distance to cropland"
];

const outputs = ["samplepoints.shp", "dataset.csv", "Inputs.txt", "Label.txt", "risk_points.geojson"];

export function ProjectLegend() {
  const [isOpen, setIsOpen] = useState(true);

  if (!isOpen) {
    return (
      <button
        className="rounded-md border border-white/30 bg-white/90 px-3 py-2 text-sm font-bold text-slate-800 shadow-xl shadow-black/20 backdrop-blur-md transition hover:bg-white"
        type="button"
        onClick={() => setIsOpen(true)}
      >
        Project Info
      </button>
    );
  }

  return (
    <aside
      className="grid gap-4 rounded-lg border border-white/30 bg-white/90 p-5 text-slate-900 shadow-2xl shadow-black/25 backdrop-blur-md"
      aria-label="Project legend"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            Project Legend
          </p>
          <h2 className="mt-1 text-lg font-bold leading-tight text-slate-950">
            Wildfire Susceptibility Mapping
          </h2>
        </div>
        <button
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-slate-200 bg-white/80 text-lg font-bold leading-none text-slate-600 transition hover:bg-slate-100"
          type="button"
          aria-label="Close project legend"
          onClick={() => setIsOpen(false)}
        >
          x
        </button>
      </div>

      <p className="text-sm leading-5 text-slate-600">
        This decision support prototype estimates wildfire susceptibility for the
        2025 Izmir Menderes-Seferihisar wildfire study area using Earth Engine
        samples, pre-fire environmental features, and trained machine learning classifiers.
      </p>

      <div className="grid gap-3">
        <div className="rounded-md border border-slate-200 bg-slate-50/80 p-3">
          <h3 className="text-sm font-bold text-slate-900">Calculation Flow</h3>
          <ol className="mt-2 grid gap-1.5 text-sm leading-5 text-slate-600">
            <li>1. Sentinel-2, terrain, land cover, water, CHIRPS and ERA5-Land layers are sampled in GEE.</li>
            <li>2. Burned and unburned labels are generated from dNBR thresholds.</li>
            <li>3. Post-fire variables are excluded from model input to avoid leakage.</li>
            <li>4. UI sliders apply deltas to all 15 model features and refresh risk scores.</li>
          </ol>
        </div>

        <div className="grid gap-2">
          <h3 className="text-sm font-bold text-slate-900">Model Inputs</h3>
          <div className="flex flex-wrap gap-1.5">
            {modelFeatures.map((feature) => (
              <span
                className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800"
                key={feature}
              >
                {feature}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-slate-200 bg-white/70 p-3">
            <h3 className="text-sm font-bold text-slate-900">Data Format</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {outputs.map((output) => (
                <code
                  className="rounded bg-slate-100 px-1.5 py-1 text-[11px] font-bold text-slate-700"
                  key={output}
                >
                  {output}
                </code>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white/70 p-3">
            <h3 className="text-sm font-bold text-slate-900">Risk Classes</h3>
            <div className="mt-2 grid gap-1.5 text-xs font-bold text-slate-600">
              <span className="inline-flex items-center gap-2">
                <i className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> Low: 0.00-0.32
              </span>
              <span className="inline-flex items-center gap-2">
                <i className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Medium: 0.33-0.65
              </span>
              <span className="inline-flex items-center gap-2">
                <i className="h-2.5 w-2.5 rounded-full bg-red-600" /> High: 0.66-1.00
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
