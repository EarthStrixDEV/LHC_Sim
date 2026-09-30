/** Minimal DOM helpers (no framework). */

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | ((ev: Event) => void) | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function select<T extends string>(options: ReadonlyArray<{ value: T; label: string; disabled?: boolean; title?: string }>, value: T, onChange: (v: T) => void, attrs: Attrs = {}): HTMLSelectElement {
  const s = h('select', attrs);
  for (const o of options) {
    const opt = h('option', { value: o.value, disabled: o.disabled, title: o.title }, o.label);
    if (o.value === value) opt.selected = true;
    s.append(opt);
  }
  s.addEventListener('change', () => onChange(s.value as T));
  return s;
}

export function row(label: string, control: Node, hint?: string): HTMLDivElement {
  return h('div', { class: 'row' }, h('label', {}, label), control, hint ? h('div', { class: 'hint' }, hint) : null);
}

export function section(title: string, ...children: Child[]): HTMLElement {
  return h('section', { class: 'panel-section' }, h('h3', {}, title), ...children);
}

/** Key/value table rows; values are pre-formatted strings. */
export function kvTable(rows: ReadonlyArray<[string, string, string?]>): HTMLTableElement {
  const t = h('table', { class: 'kv' });
  for (const [k, v, cls] of rows) t.append(h('tr', { class: cls ?? '' }, h('th', {}, k), h('td', {}, v)));
  return t;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
