/**
 * Thin, lazily-loaded bridge to JSROOT (https://root.cern/js/), kept at the edge of the app:
 * the rest of the code never imports jsroot directly.
 *
 * I/O: ROOT files are opened from a user-selected File (or a same-origin / CORS-enabled URL);
 * JSROOT reads only the baskets of the requested branches, so large files are not downloaded
 * in full. Entry count is always capped by the caller.
 */
import type { RootEntry } from './ROOTAdapter';

export interface RootFileHandle {
  readonly name: string;
  readonly trees: readonly string[];
  /** Opaque JSROOT TFile. */
  readonly file: unknown;
}

interface JsrootKey { fName: string; fClassName: string; fCycle: number }
interface JsrootFile { fFileName: string; fKeys: JsrootKey[]; readObject(name: string): Promise<JsrootTree> }
interface JsrootTree { fEntries: number; fBranches: { arr: { fName: string }[] } }

export async function openRootFile(src: File | string): Promise<RootFileHandle> {
  const { openFile } = await import('jsroot/io');
  const file = (await openFile(src)) as JsrootFile;
  const trees = file.fKeys.filter((k) => k.fClassName === 'TTree' || k.fClassName === 'TNtuple').map((k) => k.fName);
  return { name: typeof src === 'string' ? src : src.name, trees: [...new Set(trees)], file };
}

export interface TreeReadResult {
  readonly entries: RootEntry[];
  readonly totalEntries: number;
  readonly branchesRead: readonly string[];
  readonly branchesMissing: readonly string[];
}

/** Reads up to `maxEntries` entries of the requested branches (missing branches are reported). */
export async function readTreeEntries(h: RootFileHandle, treeName: string, branches: readonly string[], maxEntries: number): Promise<TreeReadResult> {
  const { TSelector, treeProcess } = await import('jsroot/tree');
  const tree = await (h.file as JsrootFile).readObject(treeName);
  const available = new Set(tree.fBranches.arr.map((b) => b.fName));
  const read = branches.filter((b) => available.has(b));
  const missing = branches.filter((b) => !available.has(b));
  if (read.length === 0) throw new Error(`Tree ${treeName} has none of the expected branches`);
  const entries: RootEntry[] = [];
  const sel = new TSelector();
  for (const b of read) sel.addBranch(b);
  sel.Process = function (this: { tgtobj: Record<string, unknown> }) {
    const e: Record<string, number | number[]> = {};
    for (const b of read) {
      const v = this.tgtobj[b];
      e[b] = typeof v === 'number' || typeof v === 'bigint' ? Number(v) : Array.from(v as ArrayLike<number>, Number);
    }
    entries.push(e);
  };
  await treeProcess(tree, sel, { numentries: Math.min(maxEntries, tree.fEntries), firstentry: 0 });
  return { entries, totalEntries: tree.fEntries, branchesRead: read, branchesMissing: missing };
}

// ---- Histograms ------------------------------------------------------------------------------

export interface PlainHistogram {
  readonly name: string;
  readonly title: string;
  readonly xLabel: string;
  readonly xMin: number;
  readonly xMax: number;
  readonly counts: readonly number[];
}

interface JsrootTH1 { fName: string; fTitle: string; fXaxis: { fNbins: number; fXmin: number; fXmax: number; fTitle: string; fXbins?: { length: number } }; fArray: ArrayLike<number>; fEntries: number }

/** Names of the 1D histograms stored in a ROOT file (top directory). */
export function listHistograms(h: RootFileHandle): string[] {
  return [...new Set((h.file as JsrootFile).fKeys.filter((k) => /^TH1[CSIFD]?$/.test(k.fClassName)).map((k) => k.fName))];
}

/** Reads a TH1 (fixed binning) into a plain object. Variable-bin histograms are rejected. */
export async function readHistogram(h: RootFileHandle, name: string): Promise<PlainHistogram> {
  const o = (await (h.file as JsrootFile).readObject(name)) as unknown as JsrootTH1;
  if (o.fXaxis.fXbins && o.fXaxis.fXbins.length > 0) throw new Error(`${name}: variable bin widths are not supported`);
  const n = o.fXaxis.fNbins;
  return { name: o.fName, title: o.fTitle, xLabel: o.fXaxis.fTitle, xMin: o.fXaxis.fXmin, xMax: o.fXaxis.fXmax, counts: Array.from({ length: n }, (_, i) => Number(o.fArray[i + 1] ?? 0)) };
}

/** Draws a histogram (and optionally a fitted curve) with JSROOT into `dom`. */
export async function drawWithJsroot(dom: HTMLElement, hist: PlainHistogram, curve: { x: number[]; y: number[] } | null): Promise<void> {
  const { createHistogram, createTGraph } = await import('jsroot/core');
  const { draw, cleanup } = await import('jsroot/draw');
  const n = hist.counts.length;
  const th1 = createHistogram('TH1D', n) as unknown as JsrootTH1 & { fArray: number[] };
  th1.fName = hist.name;
  th1.fTitle = hist.title;
  th1.fXaxis.fXmin = hist.xMin;
  th1.fXaxis.fXmax = hist.xMax;
  th1.fXaxis.fTitle = hist.xLabel;
  let entries = 0;
  hist.counts.forEach((c, i) => {
    th1.fArray[i + 1] = c;
    entries += c;
  });
  th1.fEntries = entries;
  cleanup(dom);
  await draw(dom, th1, 'hist');
  if (curve) {
    const g = createTGraph(curve.x.length, curve.x, curve.y) as Record<string, unknown>;
    g.fLineColor = 2;
    g.fLineWidth = 2;
    g.fTitle = 'fit';
    await draw(dom, g, 'L same');
  }
}
