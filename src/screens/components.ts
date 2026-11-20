import { html, type Raw } from '../lib/dom';
import { t } from '../i18n';
import { EVIDENCE_LABEL, effectiveStatus, formatClp, formatDistance, timeRemaining } from '../lib/format';
import { statusBadge } from '../lib/ui';
import { categoryOf } from '../state';
import type { RequestRow } from '../lib/api';

/** Tarjeta de solicitud usada en Explorar y Actividad. */
export function requestCard(r: RequestRow & { distance_m?: number | null; requester_name?: string }, extra?: Raw): Raw {
  const cat = categoryOf(r.category_slug);
  const status = effectiveStatus(r.status, r.expires_at);
  const left = timeRemaining(r.expires_at);
  const dist = formatDistance(r.distance_m ?? null);
  return html`
    <a class="card req-card" href="#/solicitud/${r.id}">
      <div class="row between">
        <span class="chip">${cat.icon} ${cat.name_es}</span>
        ${statusBadge(status)}
      </div>
      <h3 class="card-title">${r.title}</h3>
      <p class="card-desc">${r.description}</p>
      <div class="meta">
        <span>📍 ${r.address}${dist ? html` · <b>${dist}</b>` : ''}</span>
        <span>⏱️ ${left ? `${t('remaining')} ${left}` : t('expired')}</span>
        <span>${EVIDENCE_LABEL[r.evidence_type]}</span>
      </div>
      <div class="row between card-foot">
        <span class="reward">${formatClp(r.reward_clp)} <small>CLP · ${t('referential')}</small></span>
        ${r.requester_name ? html`<span class="muted small">${t('by')}: ${r.requester_name}</span>` : ''}
      </div>
      ${extra ?? ''}
    </a>`;
}
