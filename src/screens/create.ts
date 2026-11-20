import { t } from '../i18n';
import { html, mount, $, onAction, busy, inputValue, raw } from '../lib/dom';
import { confirmAction, paymentsNotice, screenHeader, toast } from '../lib/ui';
import { createRequest } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { getCurrentPosition } from '../lib/geo';
import { validateRequestDraft, type RequestDraft, LIMITS } from '../lib/validation';
import { EVIDENCE_LABEL, formatClp, type EvidenceType } from '../lib/format';
import { go } from '../lib/router';
import { config } from '../config';
import { state, cityName } from '../state';

const EXPIRY_OPTIONS: [number, string][] = [
  [30, '30 minutos'], [60, '1 hora'], [120, '2 horas'], [240, '4 horas'],
  [720, '12 horas'], [1440, '24 horas'], [4320, '3 días'],
];
const RADIUS_OPTIONS = [200, 500, 1000, 2000, 5000];

export function renderCreate(root: HTMLElement): void {
  // Identificador único por formulario: un doble toque nunca crea dos solicitudes.
  const clientRequestId = crypto.randomUUID();
  const city = state.profile?.city_slug ?? config.defaultCity;
  let coords: { lat: number; lng: number; accuracy: number } | null = null;

  mount(root, html`
    ${screenHeader(t('createTitle'), '#/explorar')}
    <div class="content">
      ${paymentsNotice()}
      <form id="f" novalidate class="stack">
        <label class="label" for="title">${t('title')}</label>
        <input class="input" id="title" maxlength="${LIMITS.titleMax}" placeholder="${t('titlePh')}" />
        <p class="field-error" data-err="title" hidden></p>

        <label class="label" for="desc">${t('description')}</label>
        <textarea class="input" id="desc" rows="3" maxlength="${LIMITS.descriptionMax}" placeholder="${t('descriptionPh')}"></textarea>
        <p class="field-error" data-err="description" hidden></p>

        <label class="label" for="cat">${t('category')}</label>
        <select class="input" id="cat">
          <option value="">Elige…</option>
          ${state.categories.map((c) => html`<option value="${c.slug}">${c.icon} ${c.name_es}</option>`)}
        </select>
        <p class="field-error" data-err="category" hidden></p>

        <span class="label">${t('evidenceType')}</span>
        <div class="seg seg-full" role="radiogroup">
          ${(['foto', 'texto', 'foto_texto'] as EvidenceType[]).map((v) => html`
            <label><input type="radio" name="ev" value="${v}" ${v === 'foto_texto' ? raw('checked') : ''} /><span>${EVIDENCE_LABEL[v]}</span></label>`)}
        </div>
        <p class="field-error" data-err="evidenceType" hidden></p>

        <label class="label" for="reward">${t('rewardClp')}</label>
        <input class="input" id="reward" type="number" inputmode="numeric" min="${LIMITS.rewardMin}" max="${LIMITS.rewardMax}" step="100" value="1000" />
        <div class="chips">${[500, 1000, 2000, 5000].map((v) => html`<button type="button" class="chip-btn" data-action="reward" data-v="${v}">${formatClp(v)}</button>`)}</div>
        <p class="field-error" data-err="rewardClp" hidden></p>

        <label class="label" for="addr">${t('address')} · ${cityName(city)}</label>
        <input class="input" id="addr" maxlength="${LIMITS.addressMax}" placeholder="${t('addressPh')}" />
        <p class="field-error" data-err="address" hidden></p>
        <div id="loc"></div>

        <label class="label" for="exp">${t('expiresIn')}</label>
        <select class="input" id="exp">
          ${EXPIRY_OPTIONS.map(([m, l]) => html`<option value="${m}" ${m === 120 ? raw('selected') : ''}>${l}</option>`)}
        </select>
        <p class="field-error" data-err="expiresInMinutes" hidden></p>

        <p class="field-error" id="err" role="alert" hidden></p>
        <button class="btn btn-primary btn-lg" type="submit">${t('publish')}</button>
      </form>
    </div>`);

  const locBox = $('#loc', root);
  function drawLocation(): void {
    if (!coords) {
      mount(locBox, html`<button type="button" class="btn btn-secondary btn-sm" data-action="loc">📍 ${t('useMyLocation')}</button>
        <p class="muted small">Opcional. Si no la compartes, basta con la dirección escrita.</p>`);
      return;
    }
    mount(locBox, html`<div class="notice notice-teal">✅ ${t('locationAdded')} (±${coords.accuracy} m)
        <button type="button" class="link" data-action="noloc">${t('removeLocation')}</button></div>
      <label class="label" for="radius">${t('radius')}</label>
      <select class="input" id="radius">${RADIUS_OPTIONS.map((r) => html`<option value="${r}" ${r === 500 ? raw('selected') : ''}>${r < 1000 ? `${r} m` : `${r / 1000} km`}</option>`)}</select>`);
  }
  drawLocation();

  onAction(root, {
    reward: (el) => { ($('#reward', root) as HTMLInputElement).value = el.dataset.v ?? '1000'; },
    loc: async (el) => {
      el.textContent = '📍 …';
      try { coords = await getCurrentPosition(); state.lastCoords = coords; } catch { toast(t('locationDenied'), 'error'); }
      drawLocation();
    },
    noloc: () => { coords = null; drawLocation(); },
  });

  const form = $('#f', root) as HTMLFormElement;
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const radiusEl = root.querySelector('#radius') as HTMLSelectElement | null;
    const draft: RequestDraft = {
      title: inputValue('#title', root),
      description: inputValue('#desc', root),
      category: inputValue('#cat', root),
      evidenceType: ((root.querySelector('input[name="ev"]:checked') as HTMLInputElement | null)?.value ?? '') as EvidenceType | '',
      rewardClp: Number(inputValue('#reward', root)),
      address: inputValue('#addr', root),
      expiresInMinutes: Number(inputValue('#exp', root)),
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      radiusM: coords && radiusEl ? Number(radiusEl.value) : null,
    };
    const errors = validateRequestDraft(draft);
    root.querySelectorAll<HTMLElement>('[data-err]').forEach((p) => {
      const msg = errors[p.dataset.err as keyof RequestDraft];
      p.hidden = !msg; p.textContent = msg ?? '';
    });
    if (Object.keys(errors).length) { root.querySelector<HTMLElement>('[data-err]:not([hidden])')?.scrollIntoView({ block: 'center' }); return; }

    void busy(form.querySelector('button[type="submit"]'), async () => {
      if (!(await confirmAction(t('publish'), `${t('publishConfirm')}\n\n${t('paymentsDisabled')}`))) return;
      try {
        const r = await createRequest({
          clientRequestId, title: draft.title.trim(), description: draft.description.trim(), category: draft.category,
          evidenceType: draft.evidenceType as EvidenceType, rewardClp: draft.rewardClp, address: draft.address.trim(),
          citySlug: city, expiresAt: new Date(Date.now() + draft.expiresInMinutes * 60000).toISOString(),
          lat: draft.lat, lng: draft.lng, radiusM: draft.radiusM,
        });
        toast(t('published'), 'ok');
        go(`/solicitud/${r.id}`, true);
      } catch (e) {
        const err = $('#err', root); err.hidden = false; err.textContent = friendlyError(e);
      }
    });
  });
}
