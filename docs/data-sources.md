# Data sources

Every external source enters through an **adapter** that produces the normalized model
`lhcsim-normalized/1` (`src/data-sources/NormalizedEvent.ts`):

```
External data ─▶ adapter ─▶ NormalizedSample { provenance, meta, events[] } ─▶ DataSourceRegistry ─▶ worker pipeline
```

Each `NormalizedEvent` has an optional generator-level `truth` record (HepMC-like particles,
vertices, parent/child links) and optional source `reco` objects (μ, e, γ, jets, tracks, MET,
primary vertex). Validation enforces:

- at least one of truth / reco;
- **recorded collision data (`isSimulation: false`) can never carry truth**;
- provenance with source name and license, consistent collision system and √s, finite weights.

Events with truth run the full simulation chain (propagation → response → reconstruction).
Events with reco only are passed through: their objects are displayed as RECONSTRUCTED DATA
(trajectories are helices computed from the reconstructed momenta), and no hits, cells or
truth are invented.

## Curated samples

The Phase 1 toy-generator files are wrapped losslessly (`curated/CuratedAdapter.ts`) with
provenance `CURATED`, "SYNTHETIC / CURATED" in the UI.

## CERN Open Data

`cern/DatasetRegistry.ts` catalogues CMS outreach CSV files (records
[545](https://opendata.cern.ch/record/545) and [700](http://opendata.cern.ch/record/700), CC0):
Z→μμ, Z→ee, J/ψ→μμ, Υ→μμ, W→μν, W→eν, dimuon spectra. Nothing is bundled or downloaded
automatically.

Three browser-friendly routes:

1. **Preprocessed JSON** (recommended for deployment): `npm run fetch:cern -- cms2011-zmumu --max 5000`
   writes `public/datasets/<id>.json` and `index.json`; the Data tab lists and opens them.
2. **Direct download** (Data tab → Download): streams the CSV through the Vite dev-server proxy
   (`/cern-opendata`, because opendata.cern.ch sends no CORS headers) and stops after the event cap.
3. **Local file import**: the same CSV files, or any normalized JSON.

The CSV adapter keeps column names as object attributes (`dxy`, `iso`, `sigmaEtaEta`, …),
maps `type` (G/T, EB/EE) to numeric flags, uses the PDG lepton mass (the files give none), and
records all of this in the processing notes.

## ROOT files (JSROOT)

`root/JSROOTBridge.ts` lazily loads JSROOT and reads only the requested branches of a TTree,
capped at the event limit. Supported column schemas (`root/ROOTAdapter.ts`):

| Schema | Tree | Branches |
|---|---|---|
| `cms-nanoaod` | `Events` | `Muon_*`, `Electron_*`, `Photon_*`, `Jet_*`, `MET_pt/phi`, `PV_x/y/z/npvs`, run/lumi/event |
| `atlas-opendata-13tev` | `mini` | `lep_*` (MeV, lep_type 11/13), `jet_*`, `photon_*`, `met_et/phi`, `mcWeight` |

Because data-vs-simulation cannot be inferred from branch content, the user declares it at import
(plus √s, experiment, license); it is stored in the provenance. Server-side conversion (e.g. uproot)
can emit `lhcsim-root-columns/1` JSON with the same schemas. The histogram panel can also load
TH1 objects from ROOT files.

## HepMC3

`hepmc/HepMCAdapter.ts` parses HepMC3 ASCII (`E/U/W/V/P` lines, implicit single-parent vertices,
MEV/GEV and MM/CM units). Charges come from PDG codes (`physics/particles/PdgCharge.ts`); vertex
kinds from displacement and heavy-flavour parents. HepMC is generator truth, so it can only be
imported as simulation.

## PYTHIA 8

```
Browser ─▶ EventGenerator ─▶ /api/pythia (Vite proxy) ─▶ server/pythia_server.py ─▶ PYTHIA 8 ─▶ lhcsim-pythia-record/1 ─▶ PythiaRecord adapter
```

- Processes: minimum bias, Drell–Yan Z/γ*→μμ, gg→H→γγ, QCD jets, tt̄; √s, event count (≤ 500), seed.
- The browser sends the complete settings list (`pythiaSettings()`), including
  `Random:setSeed = on` / `Random:seed = N`; the server applies it verbatim to a fresh Pythia
  instance, and the adapter checks that the returned settings match. Same request ⇒ same events.
- Compact records keep final state, beams, hard process and decayed hadrons/resonances; mother
  links are re-attached to the nearest kept ancestor server-side, and children are derived from
  mothers so links are reciprocal.
- Generation is asynchronous (backend process); the scene keeps rendering.
- **WASM**: not implemented — no maintained Emscripten build of PYTHIA 8 exists; see
  `generators/PythiaWasmWorker.ts` for the recorded decision and the contract a future port must meet.

The Python server has not been executed in this development environment (no Python installed);
the TypeScript client, adapter and determinism contract are unit-tested with fixtures.
