import { html, mount, raw } from '../lib/dom';
import { errorState, screenHeader, spinner } from '../lib/ui';
import { state } from '../state';

const TITLES: Record<string, string> = {
  privacidad: 'Política de privacidad',
  terminos: 'Términos y condiciones',
  'eliminar-cuenta': 'Eliminar cuenta y datos',
};

/** Muestra dentro de la app los mismos documentos publicados en la web. */
export function renderLegal(root: HTMLElement, params: Record<string, string>): void {
  const doc = params.doc;
  const back = state.session ? '#/perfil' : '#/registro';
  mount(root, html`${screenHeader(TITLES[doc] ?? 'Documento', back)}<div class="content legal" id="doc">${spinner()}</div>`);
  const box = root.querySelector('#doc') as HTMLElement;
  fetch(`legal/${doc}.html`, { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.text(); })
    .then((text) => {
      // Documento propio y estático (public/legal); se toma solo el <main>.
      const parsed = new DOMParser().parseFromString(text, 'text/html');
      const main = parsed.querySelector('main');
      main?.querySelectorAll('script').forEach((s) => s.remove());
      mount(box, raw(main?.innerHTML ?? ''));
    })
    .catch(() => mount(box, errorState('No se pudo cargar el documento.')));
}
