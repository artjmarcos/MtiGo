import { t } from '../i18n';
import { html, mount, $, onAction, busy, inputValue, raw } from '../lib/dom';
import { confirmAction, dialog, errorState, screenHeader, spinner, toast } from '../lib/ui';
import * as api from '../lib/api';
import { friendlyError } from '../lib/errors';
import { formatDateTime } from '../lib/format';
import { sb } from '../supabase';
import { go } from '../lib/router';
import { config } from '../config';
import { state, userId } from '../state';

export function renderProfile(root: HTMLElement): void {
  mount(root, html`${screenHeader(t('profileTitle'))}<div class="content" id="body">${spinner()}</div>`);
  const body = $('#body', root);

  async function load(): Promise<void> {
    try {
      const me = userId();
      const { profile, phone } = await api.getMyProfile(me);
      state.profile = profile; state.phone = phone;
      const blocks = await api.myBlocks();
      const email = state.session?.user.email ?? '';
      mount(body, html`
        <section class="card">
          <div class="avatar">${profile.display_name.slice(0, 1).toUpperCase()}</div>
          <p class="center"><b>${profile.display_name}</b><br><span class="muted small">${email}</span><br>
          <span class="muted small">Miembro desde ${formatDateTime(profile.created_at)}</span></p>
        </section>
        <form id="f" class="card stack" novalidate>
          <label class="label" for="name">${t('displayName')}</label>
          <input class="input" id="name" maxlength="40" value="${profile.display_name}" />
          <label class="label" for="phone">${t('phone')}</label>
          <input class="input" id="phone" type="tel" inputmode="tel" placeholder="+56 9 1234 5678" value="${phone ?? ''}" />
          <label class="label" for="city">${t('city')}</label>
          <select class="input" id="city">${state.cities.filter((c) => c.active).map((c) => html`<option value="${c.slug}" ${c.slug === profile.city_slug ? raw('selected') : ''}>${c.name}</option>`)}</select>
          <label class="check"><input type="checkbox" id="notify" ${profile.notify_new_requests ? raw('checked') : ''} /><span>${t('notifyNew')}</span></label>
          <p class="field-error" id="err" role="alert" hidden></p>
          <button class="btn btn-primary" type="submit">${t('save')}</button>
        </form>
        <section class="card">
          <h3>${t('blockedUsers')}</h3>
          ${blocks.length ? html`<ul class="plain">${blocks.map((b) => html`<li class="row between"><span>${b.name}</span>
            <button class="btn btn-ghost btn-sm" data-action="unblock" data-id="${b.blocked_id}">${t('unblock')}</button></li>`)}</ul>`
            : html`<p class="muted small">${t('noBlocked')}</p>`}
        </section>
        <section class="card stack">
          <a href="#/legal/terminos">📄 ${t('terms')}</a>
          <a href="#/legal/privacidad">🔒 ${t('privacy')}</a>
          ${config.supportEmail ? html`<a href="mailto:${config.supportEmail}">✉️ ${t('contact')}: ${config.supportEmail}</a>` : ''}
          <p class="muted small">${t('userId')}: <code>${me}</code><br>${t('version')}: ${config.appVersion}</p>
        </section>
        <button class="btn btn-secondary block" data-action="logout">${t('logout')}</button>
        <button class="btn btn-danger-ghost block" data-action="delete">${t('deleteAccount')}</button>`);

      const form = $('#f', body) as HTMLFormElement;
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        void busy(form.querySelector('button'), async () => {
          const err = $('#err', body);
          try {
            state.profile = await api.updateMyProfile({
              displayName: inputValue('#name', body).trim(), citySlug: inputValue('#city', body),
              phone: inputValue('#phone', body).trim(), notify: ($('#notify', body) as HTMLInputElement).checked,
            });
            err.hidden = true; toast(t('profileSaved'), 'ok');
          } catch (e) { err.hidden = false; err.textContent = friendlyError(e); }
        });
      });
    } catch (e) {
      mount(body, errorState(friendlyError(e)));
    }
  }

  onAction(body, {
    retry: () => void load(),
    unblock: (btn) => void busy(btn, async () => {
      try { await api.unblockUser(btn.dataset.id ?? ''); await load(); } catch (e) { toast(friendlyError(e), 'error'); }
    }),
    logout: async (btn) => {
      if (!(await confirmAction(t('logout'), '¿Cerrar sesión en este dispositivo?'))) return;
      await busy(btn, async () => { await sb().auth.signOut(); go('/bienvenida', true); });
    },
    delete: async (btn) => {
      const res = await dialog({
        title: t('deleteAccount'), message: t('deleteAccountWarn'), danger: true, confirmText: t('deleteAccount'),
        input: { placeholder: t('deleteAccountType'), required: true, mustEqual: 'ELIMINAR' },
      });
      if (!res) return;
      await busy(btn, async () => {
        try {
          // 1) Marca la eliminación en curso (habilita borrar las fotos entregadas) y
          //    borra las fotos de Storage (la base de datos no puede borrar archivos).
          await api.requestAccountDeletion();
          const paths = await api.myEvidencePaths();
          for (let i = 0; i < paths.length; i += 100) await api.deleteEvidenceObjects(paths.slice(i, i + 100));
          // 2) Borra la cuenta y todos sus datos en cascada.
          await api.deleteMyAccount();
          await sb().auth.signOut({ scope: 'local' }).catch(() => undefined);
          toast(t('accountDeleted'), 'ok');
          go('/bienvenida', true);
        } catch (e) { toast(friendlyError(e), 'error'); }
      });
    },
  });
  void load();
}
