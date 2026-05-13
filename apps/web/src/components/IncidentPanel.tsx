import { useState } from "react";

const incidentFacts = [
  ["Incident", "2025 Izmir wildfires"],
  ["Focus area", "Menderes - Seferihisar"],
  ["Ignition context", "Kuyucak / Orhanli corridor"],
  ["Event window", "29 Jun - 2 Jul 2025"],
  ["Study period", "26 Jun - 4 Jul 2025"],
  ["AOI", "Cesme, Seferihisar, Menderes, Buca and nearby districts"]
];

const dataWindows = [
  ["Pre-fire Sentinel-2", "15 Apr - 15 Jun 2025"],
  ["Post-fire Sentinel-2", "5 Jul - 25 Jul 2025"],
  ["Climate window", "26 Jun - 4 Jul 2025"]
];

export function IncidentPanel() {
  const [isOpen, setIsOpen] = useState(true);

  if (!isOpen) {
    return (
      <button
        className="rounded-md border border-white/30 bg-white/90 px-3 py-2 text-sm font-bold text-slate-800 shadow-xl shadow-black/20 backdrop-blur-md transition hover:bg-white"
        type="button"
        onClick={() => setIsOpen(true)}
      >
        Fire Event
      </button>
    );
  }

  return (
    <aside
      className="grid gap-4 rounded-lg border border-white/30 bg-white/90 p-5 text-slate-900 shadow-2xl shadow-black/25 backdrop-blur-md"
      aria-label="Fire incident information"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-700">
            Fire Event
          </p>
          <h2 className="mt-1 text-lg font-bold leading-tight text-slate-950">
            2025 Izmir Menderes-Seferihisar Wildfire
          </h2>
        </div>
        <button
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-slate-200 bg-white/80 text-lg font-bold leading-none text-slate-600 transition hover:bg-slate-100"
          type="button"
          aria-label="Close fire event panel"
          onClick={() => setIsOpen(false)}
        >
          x
        </button>
      </div>

      <p className="text-sm leading-5 text-slate-600">
        This map models wildfire susceptibility for the late June and early July
        2025 Izmir fire episode, with the core training context around the
        Menderes-Seferihisar fire that affected forest and settlement-edge areas.
      </p>

      <div className="grid grid-cols-2 gap-2">
        {incidentFacts.map(([label, value]) => (
          <div className="rounded-md border border-slate-200 bg-slate-50/80 p-3" key={label}>
            <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
              {label}
            </span>
            <strong className="mt-1 block text-sm leading-5 text-slate-900">
              {value}
            </strong>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-slate-200 bg-white/75 p-3">
        <h3 className="text-sm font-bold text-slate-900">Remote Sensing Windows</h3>
        <div className="mt-2 grid gap-2 text-sm">
          {dataWindows.map(([label, value]) => (
            <div className="flex items-center justify-between gap-3" key={label}>
              <span className="text-slate-500">{label}</span>
              <span className="font-semibold text-slate-800">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-red-100 bg-red-50/80 p-3 text-sm leading-5 text-red-950">
        Labels are generated from post-fire burn severity using dNBR. The model
        itself uses only pre-fire and environmental features to reduce leakage.
      </div>

      <p className="text-xs leading-4 text-slate-500">
        Source context: Republic of Turkiye Directorate of Communications update
        dated 3 Jul 2025, plus the Menderes-Seferihisar event timeline used in the
        GEE export workflow.
      </p>
    </aside>
  );
}
