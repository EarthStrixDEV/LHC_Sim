import type { PhysicsWarning } from '../physics/accelerator/MachineValidator';
import { h } from './dom';

const ICON: Record<PhysicsWarning['severity'], string> = { error: '⛔', warning: '⚠', info: 'ℹ' };

/** Renders physics warnings with their explanations (never just a code). */
export function renderWarnings(ws: readonly PhysicsWarning[]): HTMLElement {
  if (!ws.length) return h('div', { class: 'warn-list ok' }, '✓ No physics warnings for this configuration.');
  const order = { error: 0, warning: 1, info: 2 } as const;
  const sorted = [...ws].sort((a, b) => order[a.severity] - order[b.severity]);
  return h(
    'div',
    { class: 'warn-list' },
    ...sorted.map((w) =>
      h('div', { class: `warn ${w.severity}` }, h('div', { class: 'warn-title' }, `${ICON[w.severity]} ${w.title}`), h('div', { class: 'warn-text' }, w.explanation)),
    ),
  );
}
