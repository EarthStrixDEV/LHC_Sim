/**
 * EventGenerator backed by a PYTHIA 8 process (server/pythia_server.py) reached through
 * HTTP — the preferred Phase 2 architecture:
 *
 *   Browser → EventGenerator → backend API → PYTHIA 8 → normalized HepMC-like response
 *
 * The request carries the exact PYTHIA settings strings (from pythiaSettings) so the
 * browser, the backend and the recorded provenance can never disagree. All calls are
 * asynchronous; nothing blocks rendering.
 */
import type { NormalizedSample } from '../data-sources/NormalizedEvent';
import { pythiaSettings, validateRequest, type EventGenerator, type GenerateOptions, type GeneratorRequest, type GeneratorStatus } from './EventGenerator';
import { pythiaResponseToSample, type PythiaResponse } from './PythiaRecord';

/** Same-origin path relayed to the backend by the Vite dev server (see vite.config.ts). */
export const DEFAULT_PYTHIA_BASE = '/api/pythia';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class PythiaBackendClient implements EventGenerator {
  readonly id = 'pythia8-backend';
  readonly label = 'PYTHIA 8 (backend)';

  constructor(
    private readonly baseUrl = DEFAULT_PYTHIA_BASE,
    private readonly fetchImpl: FetchLike = (i, init) => fetch(i, init),
  ) {}

  async status(): Promise<GeneratorStatus> {
    try {
      const r = await this.fetchImpl(`${this.baseUrl}/status`, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) return { available: false, name: 'PYTHIA 8', version: null, detail: `backend answered HTTP ${r.status}` };
      const j = (await r.json()) as { name: string; version: string };
      return { available: true, name: j.name, version: j.version, detail: 'backend reachable' };
    } catch (e) {
      return { available: false, name: 'PYTHIA 8', version: null, detail: `backend not reachable (${(e as Error).message}). Start it with: python server/pythia_server.py` };
    }
  }

  async generate(req: GeneratorRequest, opts: GenerateOptions = {}): Promise<NormalizedSample> {
    validateRequest(req);
    const r = await this.fetchImpl(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nEvents: req.nEvents, record: req.record, settings: pythiaSettings(req) }),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
    if (!r.ok) throw new Error(`PYTHIA backend error ${r.status}: ${await r.text()}`);
    return pythiaResponseToSample((await r.json()) as PythiaResponse, req);
  }
}
