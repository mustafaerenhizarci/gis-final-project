import { useState } from "react";
import { ControlPanel, ScenarioState } from "./components/ControlPanel";
import { IncidentPanel } from "./components/IncidentPanel";
import { ProjectLegend } from "./components/ProjectLegend";
import { DEFAULT_FEATURE_ADJUSTMENTS } from "./features";
import { MapView } from "./map/MapView";

export function App() {
  const [scenario, setScenario] = useState<ScenarioState>(DEFAULT_FEATURE_ADJUSTMENTS);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-neutral-950 text-slate-950">
      <MapView scenario={scenario} />
      <div className="absolute left-4 top-4 z-10 grid max-h-[calc(100vh-32px)] w-[min(360px,calc(100vw-32px))] gap-4 overflow-y-auto sm:left-5 sm:top-5 sm:max-h-[calc(100vh-40px)]">
        <ControlPanel scenario={scenario} onChange={setScenario} />
        <IncidentPanel />
        <ProjectLegend />
      </div>
    </main>
  );
}
