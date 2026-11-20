// Plantillas HTML seguras: todo valor interpolado se escapa salvo que sea Raw.
export class Raw {
  constructor(public readonly value: string) {}
  toString(): string { return this.value; }
}

export function raw(value: string): Raw { return new Raw(value); }

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(s: string): string { return s.replace(/[&<>"']/g, (c) => ESC[c]); }

type Value = Raw | string | number | boolean | null | undefined | Value[];

function render(v: Value): string {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.value;
  if (Array.isArray(v)) return v.map(render).join('');
  return escapeHtml(String(v));
}

export function html(strings: TemplateStringsArray, ...values: Value[]): Raw {
  let out = '';
  strings.forEach((s, i) => { out += s + (i < values.length ? render(values[i]) : ''); });
  return new Raw(out);
}

export function $(sel: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`Elemento no encontrado: ${sel}`);
  return el as HTMLElement;
}

export function $opt(sel: string, root: ParentNode = document): HTMLElement | null {
  return root.querySelector(sel) as HTMLElement | null;
}

export function mount(el: HTMLElement, content: Raw): void { el.innerHTML = content.value; }

/** Delegación de eventos por atributo data-action. */
export function onAction(root: HTMLElement, handlers: Record<string, (el: HTMLElement, ev: Event) => void>): void {
  root.addEventListener('click', (ev) => {
    const target = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!target || !root.contains(target)) return;
    const h = handlers[target.dataset.action ?? ''];
    if (h) { ev.preventDefault(); h(target, ev); }
  });
}

export function inputValue(sel: string, root: ParentNode = document): string {
  return ($(sel, root) as HTMLInputElement).value;
}

/** Desactiva un botón mientras se ejecuta una acción (evita doble envío). */
export async function busy<T>(btn: HTMLElement | null, fn: () => Promise<T>): Promise<T | undefined> {
  if (btn && btn.getAttribute('aria-busy') === 'true') return undefined;
  btn?.setAttribute('aria-busy', 'true');
  (btn as HTMLButtonElement | null)?.setAttribute('disabled', '');
  try { return await fn(); } finally {
    btn?.removeAttribute('aria-busy');
    (btn as HTMLButtonElement | null)?.removeAttribute('disabled');
  }
}
