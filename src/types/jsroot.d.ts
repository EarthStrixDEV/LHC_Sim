/** Minimal typings for the parts of JSROOT used by JSROOTBridge / analysis (jsroot ships none for subpaths). */
declare module 'jsroot/io' {
  export function openFile(src: File | string): Promise<unknown>;
}

declare module 'jsroot/tree' {
  export class TSelector {
    tgtobj: Record<string, unknown>;
    addBranch(branch: string, name?: string): number;
    Process(entry?: number): void;
    Terminate(res?: boolean): void;
  }
  export function treeProcess(tree: unknown, selector: TSelector, args?: { numentries?: number; firstentry?: number }): Promise<unknown>;
}

declare module 'jsroot/core' {
  export function createHistogram(typename: string, nbinsx: number, nbinsy?: number, nbinsz?: number): Record<string, unknown> & { fArray: number[]; fXaxis: Record<string, unknown> };
  export function createTGraph(npoints: number, xpts?: number[], ypts?: number[]): Record<string, unknown>;
  export function create(typename: string, target?: object): Record<string, unknown>;
  export function settings(): unknown;
}

declare module 'jsroot/draw' {
  export function draw(dom: HTMLElement, obj: object, opt?: string): Promise<unknown>;
  export function redraw(dom: HTMLElement, obj: object, opt?: string): Promise<unknown>;
  export function cleanup(dom: HTMLElement): void;
}
