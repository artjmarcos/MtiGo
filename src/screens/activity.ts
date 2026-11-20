import { t } from '../i18n';
import { html, mount, $, onAction } from '../lib/dom';
import { emptyState, errorState, screenHeader, spinner } from '../lib/ui';
import { myCollaborations, myRequests, type RequestRow } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { effectiveStatus } from '../lib/format';
import { state, userId } from '../state';
import { requestCard } from './components';

const ACTIVE = ['disponible', 'aceptada', 'en_proceso', 'evidencia_entregada'];
let tab: 'mine' | 'collab' = 'mine';

export function isActive(r: RequestRow): boolean {
  return ACTIVE.includes(effectiveStatus(r.status, r.expires_at));
}

export function renderActivity(root: HTMLElement): void {
  mount(root, html`${screenHeader(t('activityTitle'))}
    <div class="content">
      <div class="seg seg-full" role="tablist">
        <button data-action="tab" data-t="mine" class="${tab === 'mine' ? 'on' : ''}" id="tab-mine">${t('myRequests')}</button>
        <button data-action="tab" data-t="collab" class="${tab === 'collab' ? 'on' : ''}" id="tab-collab">${t('myCollaborations')}</button>
      </div>
      <div id="list">${spinner()}</div>
    </div>`);
  const list = $('#list', root);

  async function load(): Promise<void> {
    mount(list, spinner());
    try {
      const me = userId();
      const [mine, collabs] = await Promise.all([myRequests(me), myCollaborations(me)]);
      const collabReqs = collabs.filter((c) => c.requests).map((c) => ({ ...(c.requests as RequestRow), _assignment: c.status }));
      const activeMine = mine.filter(isActive).length;
      const activeCollab = collabs.filter((c) => c.status === 'activa').length;
      state.activeCount = activeMine + activeCollab;
      document.dispatchEvent(new CustomEvent('mtigo:badges'));
      $('#tab-mine', root).textContent = `${t('myRequests')}${activeMine ? ` (${activeMine})` : ''}`;
      $('#tab-collab', root).textContent = `${t('myCollaborations')}${activeCollab ? ` (${activeCollab})` : ''}`;
      if (tab === 'mine') {
        mount(list, mine.length
          ? html`<p class="muted small">${activeMine} ${t('active')} · ${mine.length} en total</p><div class="list">${mine.map((r) => requestCard(r))}</div>`
          : html`${emptyState(t('emptyMyRequests'), '📝')}<a class="btn btn-primary block" href="#/pedir">${t('createTitle')}</a>`);
      } else {
        mount(list, collabReqs.length
          ? html`<p class="muted small">${activeCollab} ${t('active')} · ${collabReqs.length} en total</p><div class="list">${collabReqs.map((r) => requestCard(r,
            r._assignment !== 'activa' && r._assignment !== 'completada' ? html`<p class="muted small">Tu participación: ${r._assignment}</p>` : undefined))}</div>`
          : html`${emptyState(t('emptyMyCollaborations'), '🙋')}<a class="btn btn-primary block" href="#/explorar">${t('navExplore')}</a>`);
      }
    } catch (e) {
      mount(list, errorState(friendlyError(e)));
    }
  }

  onAction(root, {
    tab: (el) => {
      tab = el.dataset.t === 'collab' ? 'collab' : 'mine';
      root.querySelectorAll('[data-action="tab"]').forEach((b) => b.classList.toggle('on', b === el));
      void load();
    },
    retry: () => void load(),
  });
  void load();
}
