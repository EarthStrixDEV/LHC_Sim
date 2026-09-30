/**
 * Experimental PYTHIA-in-WebAssembly path — NOT IMPLEMENTED (decision recorded here).
 *
 * Assessment (Phase 2): there is no maintained Emscripten build of PYTHIA 8; a port needs
 * the C++ library, its ~20 MB XML/PDF data directory served to the browser, a virtual file
 * system and a custom HepMC-like exporter. That is a project of its own, and the plan makes
 * WASM optional. Phase 2 therefore relies on the backend (PythiaBackendClient) only.
 *
 * Contract for a future implementation: run inside a dedicated Worker (never the render
 * thread), implement EventGenerator, and emit the same "lhcsim-pythia-record/1" payload so
 * that PythiaRecord.ts converts it unchanged.
 */
import type { GeneratorStatus } from './EventGenerator';

export function pythiaWasmStatus(): GeneratorStatus {
  return {
    available: false,
    name: 'PYTHIA 8 (WebAssembly)',
    version: null,
    detail: 'Not available: no maintained WASM build of PYTHIA 8; use the backend generator.',
  };
}
