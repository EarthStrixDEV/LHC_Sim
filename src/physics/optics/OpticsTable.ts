/**
 * Optics tables: β, α along s for both planes. Produced by the built-in IR model or imported
 * from an external optics code in MAD-X TFS format (only S, BETX, BETY, ALFX, ALFY and
 * optionally NAME, X, Y are read). Imported tables are displayed as-is; lhcsim does not
 * re-derive or validate them against MAD-X.
 */

export interface OpticsTable {
  readonly source: string;
  readonly s: Float64Array;
  readonly betx: Float64Array;
  readonly bety: Float64Array;
  readonly alfx: Float64Array;
  readonly alfy: Float64Array;
  /** Closed orbit [m] where available (crossing-angle bumps). */
  readonly x: Float64Array | null;
  readonly y: Float64Array | null;
  readonly names: readonly string[] | null;
}

export class OpticsParseError extends Error {}

/** Parses a MAD-X TFS table (header "@", column names "*", types "$", then rows). */
export function parseTfs(text: string, source = 'TFS import'): OpticsTable {
  let cols: string[] | null = null;
  const rows: string[][] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('@') || line.startsWith('$') || line.startsWith('#')) continue;
    if (line.startsWith('*')) {
      cols = line.slice(1).trim().split(/\s+/).map((c) => c.toUpperCase());
      continue;
    }
    if (!cols) throw new OpticsParseError('TFS: data before column header');
    rows.push(line.match(/"[^"]*"|\S+/g) ?? []);
  }
  if (!cols) throw new OpticsParseError('TFS: no column header (*)');
  const need = ['S', 'BETX', 'BETY', 'ALFX', 'ALFY'];
  for (const c of need) if (!cols.includes(c)) throw new OpticsParseError(`TFS: missing column ${c}`);
  const col = (name: string): Float64Array | null => {
    const i = cols!.indexOf(name);
    if (i < 0) return null;
    const out = new Float64Array(rows.length);
    rows.forEach((r, k) => {
      const v = Number(r[i]);
      if (!Number.isFinite(v)) throw new OpticsParseError(`TFS row ${k + 1}: ${name} not numeric`);
      out[k] = v;
    });
    return out;
  };
  const s = col('S')!;
  for (let i = 1; i < s.length; i++) if (s[i]! < s[i - 1]!) throw new OpticsParseError('TFS: S must be non-decreasing');
  const betx = col('BETX')!, bety = col('BETY')!;
  if ([...betx, ...bety].some((b) => !(b > 0))) throw new OpticsParseError('TFS: β must be positive');
  const ni = cols.indexOf('NAME');
  return {
    source,
    s,
    betx,
    bety,
    alfx: col('ALFX')!,
    alfy: col('ALFY')!,
    x: col('X'),
    y: col('Y'),
    names: ni >= 0 ? rows.map((r) => (r[ni] ?? '').replace(/"/g, '')) : null,
  };
}

/** Linear interpolation of a table column at position s (clamped to the table range). */
export function sampleColumn(t: OpticsTable, column: Float64Array, s: number): number {
  const n = t.s.length;
  if (s <= t.s[0]!) return column[0]!;
  if (s >= t.s[n - 1]!) return column[n - 1]!;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t.s[mid]! <= s) lo = mid;
    else hi = mid;
  }
  const f = (s - t.s[lo]!) / (t.s[hi]! - t.s[lo]! || 1);
  return column[lo]! + f * (column[hi]! - column[lo]!);
}
