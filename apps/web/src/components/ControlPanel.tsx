import {
  DEFAULT_FEATURE_ADJUSTMENTS,
  FEATURE_CONFIGS,
  FeatureAdjustments,
  ModelFeatureName
} from "../features";

export type ScenarioState = FeatureAdjustments;

type Props = {
  scenario: ScenarioState;
  onChange: (scenario: ScenarioState) => void;
};

const groups = Array.from(new Set(FEATURE_CONFIGS.map((feature) => feature.group)));

function formatValue(value: number, unit: string) {
  const formatted = Math.abs(value) < 1 && value !== 0 ? value.toFixed(3) : String(value);
  return `${value > 0 ? "+" : ""}${formatted}${unit ? ` ${unit}` : ""}`;
}

export function ControlPanel({ scenario, onChange }: Props) {
  const changedFeatures = FEATURE_CONFIGS.filter((feature) => scenario[feature.name] !== 0);
  const hasScenarioChanges = changedFeatures.length > 0;

  const updateFeature = (name: ModelFeatureName, value: number) => {
    onChange({ ...scenario, [name]: value });
  };

  return (
    <section
      className="grid gap-5 rounded-lg border border-white/30 bg-white/90 p-5 text-slate-900 shadow-2xl shadow-black/25 backdrop-blur-md"
      aria-label="Scenario controls"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
            Decision Support
          </p>
          <h1 className="mt-1 text-2xl font-bold leading-tight text-slate-950">
            Wildfire Risk
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Adjust all 15 model features and recalculate risk.
          </p>
        </div>
        <div
          className={`mt-1 h-3 w-3 rounded-full ${
            hasScenarioChanges ? "bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.18)]" : "bg-emerald-600"
          }`}
        />
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-bold text-slate-600">
        {changedFeatures.length ? `${changedFeatures.length} feature adjustment(s) active` : "Baseline feature values"}
      </div>

      <div className="grid max-h-[46vh] gap-4 overflow-y-auto pr-1">
        {groups.map((group) => (
          <div className="grid gap-2" key={group}>
            <h2 className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
              {group}
            </h2>
            {FEATURE_CONFIGS.filter((feature) => feature.group === group).map((feature) => (
              <label
                className="grid gap-2 rounded-md border border-slate-200 bg-white/75 p-3"
                key={feature.name}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-800">{feature.label}</span>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                    {formatValue(scenario[feature.name], feature.unit)}
                  </span>
                </div>
                <input
                  className="h-2 w-full accent-emerald-700"
                  type="range"
                  min={feature.min}
                  max={feature.max}
                  step={feature.step}
                  value={scenario[feature.name]}
                  onChange={(event) => updateFeature(feature.name, Number(event.target.value))}
                />
              </label>
            ))}
          </div>
        ))}
      </div>

      <button
        className="h-11 rounded-md bg-emerald-700 px-4 text-sm font-bold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
        type="button"
        disabled={!hasScenarioChanges}
        onClick={() => onChange(DEFAULT_FEATURE_ADJUSTMENTS)}
      >
        Reset All Features
      </button>
    </section>
  );
}
