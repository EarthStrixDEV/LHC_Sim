#!/usr/bin/env python3
"""
Local PYTHIA 8 backend for the LHC simulator (Phase 2).

    pip install pythia8mc          # official PYTHIA 8 Python bindings (import name: pythia8)
    python server/pythia_server.py [--port 8765]

The Vite dev server relays /api/pythia/* to http://127.0.0.1:8765 (vite.config.ts).

Endpoints
  GET  /status    -> {"name": "PYTHIA", "version": "8.3xx"}
  POST /generate  <- {"nEvents": int, "record": "compact"|"full", "settings": [str, ...]}
                  -> "lhcsim-pythia-record/1" JSON (see src/generators/PythiaRecord.ts)

Determinism: the browser sends every setting, including "Random:setSeed = on" and
"Random:seed = N". A fresh Pythia instance is created per request, so identical requests
produce identical events.

Only settings whose key starts with an allowed prefix are accepted. The server binds to
127.0.0.1 only.
"""
import argparse
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import pythia8  # provided by the pythia8mc package
except ImportError:  # pragma: no cover - reported at startup
    pythia8 = None

FORMAT = "lhcsim-pythia-record/1"
MAX_EVENTS = 500
ALLOWED_PREFIXES = (
    "Beams:", "Random:", "Next:", "SoftQCD:", "HardQCD:", "WeakSingleBoson:", "HiggsSM:", "Top:",
    "PhaseSpace:", "23:", "24:", "25:", "6:", "Tune:", "PartonLevel:", "HadronLevel:",
)


def keep_compact(particle):
    """Final state, beams (11-19), hard process (21-29), and decayed hadrons / resonances."""
    s = abs(particle.status())
    if particle.isFinal():
        return True
    if 11 <= s <= 29:
        return True
    if particle.isHadron() or particle.isResonance() or abs(particle.id()) in (15, 23, 24, 25, 6):
        return len(particle.daughterList()) > 0
    return False


def export_event(pythia, index, compact):
    ev = pythia.event
    n = ev.size()
    kept = [i for i in range(1, n) if (not compact) or keep_compact(ev[i])]
    kept_set = set(kept)

    def kept_mothers(i):
        """Nearest kept ancestors of entry i (walk up through removed entries)."""
        out, stack, seen = set(), list(ev[i].motherList()), set()
        while stack:
            m = stack.pop()
            if m <= 0 or m in seen:
                continue
            seen.add(m)
            if m in kept_set:
                out.add(m)
            else:
                stack.extend(ev[m].motherList())
        return sorted(out)

    particles = []
    for i in kept:
        p = ev[i]
        mothers = kept_mothers(i) if compact else [m for m in p.motherList() if m > 0]
        particles.append({
            "i": i,
            "id": p.id(),
            "status": p.status(),
            "mothers": mothers,
            "p": [p.px(), p.py(), p.pz(), p.e()],
            "m": p.m(),
            "v": [p.xProd(), p.yProd(), p.zProd(), p.tProd()],
        })
    info = pythia.info
    return {
        "index": index,
        "weight": info.weight(),
        "particles": particles,
        "info": {"code": info.code(), "name": info.name()},
    }


def generate(n_events, record, settings):
    if pythia8 is None:
        raise RuntimeError("pythia8 module not installed (pip install pythia8mc)")
    if not (1 <= n_events <= MAX_EVENTS):
        raise ValueError(f"nEvents must be 1..{MAX_EVENTS}")
    for s in settings:
        if not isinstance(s, str) or not s.startswith(ALLOWED_PREFIXES):
            raise ValueError(f"setting not allowed: {s!r}")
    pythia = pythia8.Pythia()
    pythia.readString("Print:quiet = on")
    for s in settings:
        if not pythia.readString(s):
            raise ValueError(f"PYTHIA rejected setting: {s!r}")
    if not pythia.init():
        raise RuntimeError("PYTHIA initialization failed")
    events, tries = [], 0
    while len(events) < n_events:
        tries += 1
        if tries > 20 * n_events:
            raise RuntimeError("too many failed events")
        if not pythia.next():
            continue
        events.append(export_event(pythia, len(events), record == "compact"))
    info = pythia.info
    return {
        "format": FORMAT,
        "generator": {"name": "PYTHIA", "version": version_of(pythia)},
        "settings": settings,
        "sigmaGenMb": info.sigmaGen(),
        "sigmaErrMb": info.sigmaErr(),
        "events": events,
    }


def version_of(pythia):
    try:
        return f"{pythia.settings.parm('Pythia:versionNumber'):.3f}"
    except Exception:  # noqa: BLE001 - version is informational
        return "8.x"


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):  # noqa: N802
        if self.path.rstrip("/") == "/status":
            if pythia8 is None:
                return self._send(503, {"error": "pythia8 module not installed (pip install pythia8mc)"})
            p = pythia8.Pythia()
            return self._send(200, {"name": "PYTHIA", "version": version_of(p)})
        self._send(404, {"error": "not found"})

    def do_POST(self):  # noqa: N802
        if self.path.rstrip("/") != "/generate":
            return self._send(404, {"error": "not found"})
        try:
            req = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))))
            out = generate(int(req["nEvents"]), req.get("record", "compact"), list(req["settings"]))
            self._send(200, out)
        except (ValueError, KeyError, TypeError) as e:
            self._send(400, {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            self._send(500, {"error": str(e)})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args()
    if pythia8 is None:
        print("WARNING: pythia8 module not found - install with: pip install pythia8mc", file=sys.stderr)
    srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"PYTHIA backend on http://127.0.0.1:{args.port}")
    srv.serve_forever()


if __name__ == "__main__":
    main()
