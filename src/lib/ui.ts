// Componentes de interfaz: avisos breves, diálogos de confirmación y estados.
import { html, raw, escapeHtml, type Raw } from './dom';
import { t } from '../i18n';
import { STATUS_LABEL, STATUS_TONE, type RequestStatus } from './format';

export function toast(message: string, kind: 'ok' | 'error' | 'info' = 'info'): void {
  let host = document.getElementById('toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.classList.add('out'), kind === 'error' ? 4500 : 2800);
  setTimeout(() => el.remove(), kind === 'error' ? 5000 : 3300);
}

interface DialogOptions {
  title: string;
  message?: string;
  confirmText?: string;
  danger?: boolean;
  input?: { placeholder: string; required?: boolean; minLength?: number; multiline?: boolean; mustEqual?: string };
  select?: { label: string; options: [string, string][] };
}

/** Diálogo modal. Devuelve null si se cancela; si hay campo, devuelve su texto. */
export function dialog(opts: DialogOptions): Promise<{ text: string; choice: string } | null> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    const field = opts.input
      ? (opts.input.multiline
        ? html`<textarea class="input" rows="3" maxlength="500" placeholder="${opts.input.placeholder}"></textarea>`
        : html`<input class="input" maxlength="100" placeholder="${opts.input.placeholder}" />`)
      : raw('');
    const select = opts.select
      ? html`<label class="label">${opts.select.label}</label><select class="input">${opts.select.options.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select>`
      : raw('');
    wrap.innerHTML = html`
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
        <h2 id="dlg-title">${opts.title}</h2>
        ${opts.message ? html`<p class="muted">${opts.message}</p>` : ''}
        ${select}${field}
        <p class="field-error" hidden></p>
        <div class="row gap end">
          <button class="btn btn-ghost" data-r="cancel">${t('cancel')}</button>
          <button class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'}" data-r="ok">${opts.confirmText ?? t('confirm')}</button>
        </div>
      </div>`.value;
    document.body.appendChild(wrap);
    const input = wrap.querySelector('input, textarea') as HTMLInputElement | null;
    const sel = wrap.querySelector('select') as HTMLSelectElement | null;
    const err = wrap.querySelector('.field-error') as HTMLElement;
    (input ?? (wrap.querySelector('[data-r="ok"]') as HTMLElement)).focus();
    const close = (v: { text: string; choice: string } | null) => { wrap.remove(); resolve(v); };
    wrap.addEventListener('click', (ev) => {
      const r = (ev.target as HTMLElement).closest('[data-r]') as HTMLElement | null;
      if (ev.target === wrap || r?.dataset.r === 'cancel') return close(null);
      if (r?.dataset.r === 'ok') {
        const text = (input?.value ?? '').trim();
        const i = opts.input;
        if (i?.required && text.length < (i.minLength ?? 1)) {
          err.hidden = false;
          err.textContent = i.minLength ? `Mínimo ${i.minLength} caracteres.` : 'Campo obligatorio.';
          return;
        }
        if (i?.mustEqual !== undefined && text !== i.mustEqual) {
          err.hidden = false; err.textContent = `Escribe exactamente: ${i.mustEqual}`; return;
        }
        close({ text, choice: sel?.value ?? '' });
      }
    });
  });
}

export async function confirmAction(title: string, message?: string, danger = false, confirmText?: string): Promise<boolean> {
  return (await dialog({ title, message, danger, confirmText })) !== null;
}

export function statusBadge(status: RequestStatus): Raw {
  return html`<span class="badge badge-${STATUS_TONE[status]}">${STATUS_LABEL[status]}</span>`;
}

export function spinner(label = t('loading')): Raw {
  return html`<div class="center pad"><div class="spinner" aria-hidden="true"></div><p class="muted">${label}</p></div>`;
}

export function errorState(message: string): Raw {
  return html`<div class="empty"><p>⚠️ ${message}</p><button class="btn btn-secondary" data-action="retry">${t('retry')}</button></div>`;
}

export function emptyState(message: string, icon = '🔎'): Raw {
  return html`<div class="empty"><div class="empty-icon">${icon}</div><p>${message}</p></div>`;
}

export function paymentsNotice(): Raw {
  return html`<div class="notice notice-orange" role="note">💳 ${t('paymentsDisabled')}</div>`;
}

export function screenHeader(title: string, backHref?: string, extra: Raw = raw('')): Raw {
  return html`<header class="topbar">
    ${backHref ? html`<a class="icon-btn" href="${backHref}" aria-label="${t('back')}" data-back>←</a>` : ''}
    <h1>${title}</h1><div class="spacer"></div>${extra}</header>`;
}

export function textToHtml(s: string): Raw {
  return raw(escapeHtml(s).replace(/\n/g, '<br>'));
}
