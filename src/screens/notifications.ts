import { t } from '../i18n';
import { html, mount, $, onAction, busy } from '../lib/dom';
import { emptyState, errorState, screenHeader, spinner, toast } from '../lib/ui';
import { getNotifications, markRead } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { relativeTime } from '../lib/format';
import { state } from '../state';

const ICON: Record<string, string> = {
  nueva_solicitud: '🆕', solicitud_aceptada: '🙋', evidencia_entregada: '📤', solicitud_aprobada: '✅',
  solicitud_rechazada: '✖️', solicitud_cancelada: '🚫', solicitud_liberada: '↩️', nuevo_mensaje: '💬',
};

export function renderNotifications(root: HTMLElement): void {
  mount(root, html`${screenHeader(t('notificationsTitle'), undefined, html`<button class="btn btn-ghost btn-sm" data-action="all">${t('markAllRead')}</button>`)}
    <div class="content"><p class="muted small">${t('pushNote')}</p><div id="list">${spinner()}</div></div>`);
  const list = $('#list', root);

  async function load(): Promise<void> {
    try {
      const items = await getNotifications();
      state.unread = items.filter((n) => !n.read_at).length;
      document.dispatchEvent(new CustomEvent('mtigo:badges'));
      mount(list, items.length ? html`<ul class="notif-list">${items.map((n) => html`
        <li><a class="notif ${n.read_at ? '' : 'unread'}" href="${n.request_id ? `#/solicitud/${n.request_id}` : '#/avisos'}" data-action="open" data-id="${n.id}" data-href="${n.request_id ? `#/solicitud/${n.request_id}` : ''}">
          <span class="notif-icon">${ICON[n.kind] ?? '🔔'}</span>
          <span class="grow"><b>${n.title}</b><br><span class="small">${n.body}</span></span>
          <span class="muted small">${relativeTime(n.created_at)}</span></a></li>`)}</ul>` : emptyState(t('emptyNotifications'), '🔔'));
    } catch (e) {
      mount(list, errorState(friendlyError(e)));
    }
  }

  onAction(root, {
    retry: () => void load(),
    all: (btn) => void busy(btn, async () => {
      try { await markRead(null); await load(); } catch (e) { toast(friendlyError(e), 'error'); }
    }),
    open: (el) => {
      const id = el.dataset.id;
      if (id) void markRead([id]).catch(() => 0);
      if (el.dataset.href) location.hash = el.dataset.href;
      else void load();
    },
  });
  void load();
}
