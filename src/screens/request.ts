import { t } from '../i18n';
import { html, mount, $, $opt, onAction, busy, raw, type Raw } from '../lib/dom';
import { confirmAction, dialog, errorState, paymentsNotice, screenHeader, spinner, statusBadge, textToHtml, toast } from '../lib/ui';
import * as api from '../lib/api';
import { friendlyError } from '../lib/errors';
import { capturePhoto, syncServerTime } from '../lib/camera';
import { mapsLink } from '../lib/geo';
import { createMap, pinIcon, type MtigoMap } from '../lib/map';
import { EVIDENCE_LABEL, STATUS_LABEL, effectiveStatus, formatClp, formatDateTime, relativeTime, timeRemaining } from '../lib/format';
import { LIMITS, evidencePath, validateEvidence } from '../lib/validation';
import { categoryOf, cityName, userId } from '../state';

interface LocalPhoto { key: string; fileId?: string; path?: string; url: string; status: 'uploading' | 'ok' | 'error'; error?: string }

const REPORT_REASONS: [string, string][] = [
  ['contenido_inapropiado', 'Contenido inapropiado'], ['spam', 'Spam o publicidad'], ['acoso', 'Acoso u ofensas'],
  ['fraude', 'Fraude o engaño'], ['datos_personales', 'Expone datos personales'], ['peligroso', 'Situación peligrosa'], ['otro', 'Otro'],
];

export function renderRequest(root: HTMLElement, params: Record<string, string>): () => void {
  const id = params.id;
  const me = userId();
  let disposed = false;
  let photos: LocalPhoto[] = [];
  let submission: api.Submission | null = null;
  let req: api.RequestRow | null = null;
  let draftText = '';
  let msgTimer: number | undefined;

  mount(root, html`${screenHeader(t('detailTitle'), '#/explorar')}<div id="req-map" class="map map-hero" hidden></div><div class="content" id="body">${spinner()}</div>`);
  const body = $('#body', root);
  let reqMap: MtigoMap | null = null;

  // Mapa del lugar (una sola vez; no se recrea en cada actualización).
  async function showPlace(r: api.RequestRow): Promise<void> {
    if (reqMap || r.lat === null || r.lng === null || disposed) return;
    const el = $('#req-map', root);
    el.hidden = false;
    const lat = Number(r.lat); const lng = Number(r.lng);
    reqMap = await createMap(el, { lat, lng }, 17);
    if (disposed) { reqMap.destroy(); return; }
    const { L, map } = reqMap;
    if (r.radius_m) L.circle([lat, lng], { radius: r.radius_m, color: '#FF9800', weight: 2, fillOpacity: 0.08 }).addTo(map);
    L.marker([lat, lng], { icon: pinIcon(L), title: r.address }).addTo(map);
  }

  async function load(): Promise<void> {
    try {
      req = await api.getRequest(id);
      if (disposed) return;
      if (!req) { mount(body, html`<div class="empty"><p>${t('notFound')}</p><a class="btn btn-secondary" href="#/explorar">${t('back')}</a></div>`); return; }
      const r = req;
      const isRequester = r.requester_id === me;
      const assignments = await api.getAssignments(id);
      const myAssignment = assignments.find((a) => a.collaborator_id === me) ?? null;
      const activeAssignment = assignments.find((a) => a.status === 'activa') ?? null;
      const relevantAssignment = isRequester ? (activeAssignment ?? assignments[0] ?? null) : myAssignment;
      const isParticipant = isRequester || !!myAssignment;

      const subs = isParticipant ? await api.getSubmissions(id) : [];
      submission = relevantAssignment ? subs.find((s) => s.assignment_id === relevantAssignment.id) ?? null : null;
      const files = submission ? await api.getFiles(submission.id) : [];
      const urls = files.length ? await api.signedUrls(files.map((f) => f.storage_path)).catch(() => ({} as Record<string, string>)) : {};
      if (submission?.status === 'borrador' && myAssignment) {
        const pending = photos.filter((p) => p.status !== 'ok');
        photos = [...files.map((f) => ({ key: f.id, fileId: f.id, path: f.storage_path, url: urls[f.storage_path] ?? '', status: 'ok' as const })), ...pending];
      }
      const [history, messages, requesterName, collaboratorName] = await Promise.all([
        isParticipant ? api.getHistory(id) : Promise.resolve([]),
        isParticipant && relevantAssignment ? api.getMessages(id) : Promise.resolve([]),
        api.getProfileName(r.requester_id),
        relevantAssignment ? api.getProfileName(relevantAssignment.collaborator_id) : Promise.resolve(''),
      ]);
      if (disposed) return;

      const status = effectiveStatus(r.status, r.expires_at);
      const cat = categoryOf(r.category_slug);
      const left = timeRemaining(r.expires_at);
      const otherUserId = isRequester ? relevantAssignment?.collaborator_id ?? null : r.requester_id;

      mount(body, html`
        <article class="card">
          <div class="row between"><span class="chip">${cat.icon} ${cat.name_es}</span>${statusBadge(status)}</div>
          <h2 class="card-title big">${r.title}</h2>
          <p>${textToHtml(r.description)}</p>
          <dl class="facts">
            <dt>${t('reward')}</dt><dd><b class="reward">${formatClp(r.reward_clp)} CLP</b> <span class="muted small">(${t('referential')})</span></dd>
            <dt>${t('address')}</dt><dd>${r.address}, ${cityName(r.city_slug)}
              ${r.lat !== null && r.lng !== null ? html` · <a href="${mapsLink(Number(r.lat), Number(r.lng))}" target="_blank" rel="noopener">Ver en mapa</a>` : ''}
              ${r.radius_m ? html`<br><span class="muted small">Radio: ${r.radius_m} m</span>` : ''}</dd>
            <dt>${t('evidenceType')}</dt><dd>${EVIDENCE_LABEL[r.evidence_type]}</dd>
            <dt>Vence</dt><dd>${formatDateTime(r.expires_at)}${left && status === 'disponible' ? html` <span class="muted">(${t('remaining')} ${left})</span>` : ''}</dd>
            <dt>${t('requester')}</dt><dd>${isRequester ? 'Tú' : requesterName}</dd>
            ${relevantAssignment ? html`<dt>${t('collaborator')}</dt><dd>${relevantAssignment.collaborator_id === me ? 'Tú' : collaboratorName}</dd>` : ''}
          </dl>
        </article>
        ${paymentsNotice()}
        <div id="actions">${actions(r, status, isRequester, myAssignment, activeAssignment)}</div>
        ${evidenceView(submission, files, urls)}
        ${relevantAssignment && isParticipant ? messagesView(messages, relevantAssignment, r) : ''}
        ${isParticipant && history.length ? historyView(history) : ''}
        <div class="row gap wrap footer-actions">
          ${!isRequester || otherUserId ? html`<button class="btn btn-ghost btn-sm" data-action="report">🚩 ${t('report')}</button>` : ''}
          ${otherUserId && otherUserId !== me ? html`<button class="btn btn-ghost btn-sm" data-action="block" data-user="${otherUserId}">🚫 ${t('block')}</button>` : ''}
        </div>`);
      void showPlace(r);
      const ta = $opt('#ev-text', body) as HTMLTextAreaElement | null;
      if (ta) { ta.value = draftText; ta.addEventListener('input', () => { draftText = ta.value; }); }
    } catch (e) {
      if (!disposed) mount(body, errorState(friendlyError(e)));
    }
  }

  function actions(r: api.RequestRow, status: string, isRequester: boolean, mine: api.Assignment | null, active: api.Assignment | null): Raw {
    if (isRequester) {
      const out: Raw[] = [];
      if (status === 'disponible') out.push(html`<p class="muted">Esperando que un colaborador acepte.</p>`);
      if (status === 'aceptada' || status === 'en_proceso') out.push(html`<p class="notice notice-teal">${t('waitingEvidence')}</p>`);
      if (status === 'evidencia_entregada') out.push(html`<div class="row gap">
          <button class="btn btn-primary btn-lg grow" data-action="approve">✅ ${t('approve')}</button>
          <button class="btn btn-danger btn-lg grow" data-action="reject">✖ ${t('reject')}</button></div>`);
      if (['disponible', 'aceptada', 'en_proceso'].includes(status)) out.push(html`<button class="btn btn-ghost" data-action="cancel">${t('cancelRequest')}</button>`);
      return html`${out}`;
    }
    if (mine && mine.status === 'activa' && (r.status === 'aceptada' || r.status === 'en_proceso')) return deliverForm(r, mine);
    if (mine && r.status === 'evidencia_entregada') return html`<p class="notice notice-orange">${t('waitingReview')}</p>`;
    if (!active && status === 'disponible') return html`<button class="btn btn-primary btn-lg block" data-action="accept">🙋 ${t('accept')}</button>`;
    return raw('');
  }

  function deliverForm(r: api.RequestRow, a: api.Assignment): Raw {
    const needsPhoto = r.evidence_type !== 'texto';
    const needsText = r.evidence_type !== 'foto';
    return html`
      <section class="card deliver">
        <h3>${t('deliverTitle')}</h3>
        <p class="muted small">${t('deliverBefore')} ${formatDateTime(a.due_at)} (${timeRemaining(a.due_at) ?? t('expired')})</p>
        <label class="label" for="ev-text">${t('yourAnswer')}${needsText ? ' *' : ' (opcional)'}</label>
        <textarea class="input" id="ev-text" rows="4" maxlength="${LIMITS.evidenceTextMax}" placeholder="${t('yourAnswerPh')}"></textarea>
        <span class="label">Fotos${needsPhoto ? ' *' : ' (opcional)'} · ${photos.length}/${LIMITS.maxPhotos}</span>
        <div class="photos">${photoItems()}</div>
        <div class="row gap" id="pickers" ${photos.length >= LIMITS.maxPhotos ? raw('hidden') : ''}>
          <button type="button" class="btn btn-teal btn-lg grow" data-action="camera">📷 ${t('takePhoto')}</button></div>
        <p class="muted small">🔒 Las fotos se toman en el momento con la cámara de la app y llevan fecha y hora del servidor. No se aceptan fotos de la galería.</p>
        <p class="field-error" id="ev-err" role="alert" hidden></p>
        <button class="btn btn-primary btn-lg block" data-action="submit">📤 ${t('sendEvidence')}</button>
        <button class="btn btn-ghost block" data-action="release">${t('release')}</button>
      </section>`;
  }

  function evidenceView(s: api.Submission | null, files: api.EvidenceFile[], urls: Record<string, string>): Raw {
    if (!s || s.status === 'borrador') return raw('');
    const tone = s.status === 'aprobada' ? 'green' : s.status === 'rechazada' ? 'red' : 'orange';
    return html`<section class="card">
      <div class="row between"><h3>${t('evidenceTitle')}</h3><span class="badge badge-${tone}">${s.status === 'entregada' ? 'Por revisar' : s.status === 'aprobada' ? 'Aprobada' : 'Rechazada'}</span></div>
      ${s.submitted_at ? html`<p class="muted small">Entregada ${formatDateTime(s.submitted_at)}</p>` : ''}
      <p>${s.body_text ? textToHtml(s.body_text) : html`<i class="muted">${t('noText')}</i>`}</p>
      ${files.length ? html`<p class="muted small">📷 Fotos tomadas con la cámara de MtiGo! · recibidas en el servidor ${formatDateTime(files[0].created_at)}</p><div class="photos">${files.map((f) => urls[f.storage_path]
        ? html`<a class="photo ok" href="${urls[f.storage_path]}" target="_blank" rel="noopener"><img src="${urls[f.storage_path]}" alt="Foto de evidencia" loading="lazy" /></a>`
        : html`<div class="photo error"><figcaption>No se pudo cargar</figcaption></div>`)}</div>` : ''}
      ${s.rejection_reason ? html`<p class="notice notice-red"><b>${t('rejectionReason')}:</b> ${s.rejection_reason}</p>` : ''}
    </section>`;
  }

  function messagesView(msgs: api.Message[], a: api.Assignment, r: api.RequestRow): Raw {
    const open = !['cancelada', 'vencida'].includes(r.status) && ['activa', 'completada', 'rechazada'].includes(a.status);
    return html`<section class="card">
      <h3>💬 ${t('messages')}</h3>
      <div class="chat" id="chat">${msgs.length ? msgs.map((m) => html`
        <div class="bubble ${m.sender_id === me ? 'me' : 'them'}"><span>${m.body}</span><small>${relativeTime(m.created_at)}</small></div>`)
        : html`<p class="muted small">Sin mensajes todavía.</p>`}</div>
      ${open ? html`<form class="row gap" id="msg-form"><input class="input grow" id="msg" maxlength="1000" placeholder="${t('messagePh')}" />
        <button class="btn btn-teal" type="submit">${t('send')}</button></form>` : ''}
    </section>`;
  }

  function historyView(h: api.HistoryRow[]): Raw {
    return html`<section class="card"><h3>🕒 ${t('history')}</h3><ol class="timeline">${h.map((x) => html`
      <li><b>${STATUS_LABEL[x.to_status]}</b> <span class="muted small">${formatDateTime(x.created_at)}</span>
      ${x.note ? html`<br><span class="small">${x.note}</span>` : ''}</li>`)}</ol></section>`;
  }

  function photoItems(): Raw {
    return html`${photos.map((p) => html`
          <figure class="photo ${p.status}">
            ${p.url ? html`<img src="${p.url}" alt="Foto de evidencia" />` : ''}
            <figcaption>${p.status === 'uploading' ? t('uploading') : p.status === 'error' ? `⚠️ ${p.error ?? t('uploadFailed')}` : '✓'}</figcaption>
            ${p.status !== 'uploading' ? html`<button class="photo-del" data-action="delphoto" data-key="${p.key}" aria-label="${t('removePhoto')}">✕</button>` : ''}
          </figure>`)}`;
  }

  // ---------- fotos ----------
  async function ensureSubmission(): Promise<api.Submission> {
    if (submission && submission.status === 'borrador') return submission;
    submission = await api.startSubmission(id);
    return submission;
  }

  async function takePhoto(): Promise<void> {
    if (!req) return;
    if (photos.length >= LIMITS.maxPhotos) { toast(t('maxPhotos'), 'info'); return; }
    let blob: Blob | null;
    try {
      blob = await capturePhoto({ city: cityName(req.city_slug), requestId: id });
    } catch (e) {
      toast(e instanceof Error ? e.message : t('uploadFailed'), 'error');
      return;
    }
    if (!blob) return;
    const p: LocalPhoto = { key: crypto.randomUUID(), url: URL.createObjectURL(blob), status: 'uploading' };
    photos.push(p);
    redrawActions();
    try {
      const s = await ensureSubmission();
      const path = evidencePath(id, s.id, crypto.randomUUID(), 'jpg');
      await api.uploadEvidence(path, blob, 'image/jpeg');
      try {
        const f = await api.addEvidenceFile(s.id, path, 'image/jpeg', blob.size);
        p.fileId = f.id; p.path = path; p.status = 'ok';
      } catch (e) {
        await api.deleteEvidenceObjects([path]).catch(() => undefined);
        throw e;
      }
    } catch (e) {
      p.status = 'error'; p.error = friendlyError(e);
    }
    redrawActions();
  }

  function redrawActions(): void {
    if (!req || disposed) return;
    const box = $opt('#actions', body);
    const ta = $opt('#ev-text', body) as HTMLTextAreaElement | null;
    if (ta) draftText = ta.value;
    if (!box) return;
    // Solo se vuelve a dibujar el bloque de fotos para no perder el texto escrito.
    const photosEl = $opt('.photos', box);
    if (photosEl) {
      photosEl.innerHTML = photoItems().value;
      const count = photosEl.previousElementSibling;
      if (count) count.textContent = count.textContent?.replace(/\d+\/\d+/, `${photos.length}/${LIMITS.maxPhotos}`) ?? '';
      const pickers = $opt('#pickers', box);
      if (pickers) pickers.hidden = photos.length >= LIMITS.maxPhotos;
    }
  }


  body.addEventListener('submit', (ev) => {
    const form = ev.target as HTMLFormElement;
    if (form.id !== 'msg-form') return;
    ev.preventDefault();
    const input = $('#msg', form) as HTMLInputElement;
    const text = input.value.trim();
    if (!text) return;
    void busy(form.querySelector('button'), async () => {
      try { await api.sendMessage(id, text); input.value = ''; await refreshMessages(); } catch (e) { toast(friendlyError(e), 'error'); }
    });
  });

  async function refreshMessages(): Promise<void> {
    const chat = $opt('#chat', body);
    if (!chat || disposed) return;
    try {
      const msgs = await api.getMessages(id);
      chat.innerHTML = html`${msgs.map((m) => html`<div class="bubble ${m.sender_id === me ? 'me' : 'them'}"><span>${m.body}</span><small>${relativeTime(m.created_at)}</small></div>`)}`.value;
      chat.scrollTop = chat.scrollHeight;
    } catch { /* reintenta en el próximo ciclo */ }
  }

  // ---------- acciones ----------
  async function run(btn: HTMLElement, fn: () => Promise<unknown>, okMsg?: string): Promise<void> {
    await busy(btn, async () => {
      try { await fn(); if (okMsg) toast(okMsg, 'ok'); await load(); } catch (e) { toast(friendlyError(e), 'error'); await load(); }
    });
  }

  onAction(body, {
    retry: () => void load(),
    camera: () => void takePhoto(),
    accept: async (btn) => {
      if (!(await confirmAction(t('accept'), t('acceptConfirm')))) return;
      await run(btn, () => api.acceptRequest(id), t('accepted'));
    },
    release: async (btn) => {
      if (!(await confirmAction(t('release'), t('releaseConfirm'), true))) return;
      await run(btn, async () => {
        const paths = photos.filter((p) => p.path).map((p) => p.path as string);
        await api.deleteEvidenceObjects(paths).catch(() => undefined);
        photos = []; draftText = '';
        await api.releaseRequest(id);
      });
    },
    cancel: async (btn) => {
      const res = await dialog({ title: t('cancelRequest'), message: t('cancelConfirm'), danger: true, input: { placeholder: t('cancelReasonPh'), multiline: true } });
      if (!res) return;
      await run(btn, () => api.cancelRequest(id, res.text));
    },
    delphoto: async (btn) => {
      const p = photos.find((x) => x.key === btn.dataset.key);
      if (!p) return;
      await busy(btn, async () => {
        try {
          if (p.fileId) await api.removeEvidenceFile(p.fileId);
          if (p.path) await api.deleteEvidenceObjects([p.path]).catch(() => undefined);
          photos = photos.filter((x) => x !== p);
          redrawActions();
        } catch (e) { toast(friendlyError(e), 'error'); }
      });
    },
    submit: async (btn) => {
      if (!req) return;
      const err = $('#ev-err', body);
      const text = ($('#ev-text', body) as HTMLTextAreaElement).value;
      if (photos.some((p) => p.status === 'uploading')) { err.hidden = false; err.textContent = 'Espera a que terminen de subir las fotos.'; return; }
      const okPhotos = photos.filter((p) => p.status === 'ok').length;
      const problem = validateEvidence({ evidenceType: req.evidence_type, text, photoCount: okPhotos });
      if (problem) { err.hidden = false; err.textContent = problem; return; }
      if (!(await confirmAction(t('sendEvidence'), t('sendEvidenceConfirm')))) return;
      await run(btn, async () => {
        const s = await ensureSubmission();
        await api.submitEvidence(s.id, text);
        photos = []; draftText = '';
      }, t('evidenceSent'));
    },
    approve: async (btn) => {
      if (!(await confirmAction(t('approve'), t('approveConfirm')))) return;
      await run(btn, () => api.reviewEvidence(id, true, null), t('approved'));
    },
    reject: async (btn) => {
      const res = await dialog({ title: t('rejectTitle'), danger: true, confirmText: t('reject'), input: { placeholder: t('rejectReasonPh'), required: true, minLength: 5, multiline: true } });
      if (!res) return;
      await run(btn, () => api.reviewEvidence(id, false, res.text), t('rejected'));
    },
    report: async (btn) => {
      const res = await dialog({ title: t('reportTitle'), select: { label: 'Motivo', options: REPORT_REASONS }, input: { placeholder: t('reportDetailsPh'), multiline: true } });
      if (!res) return;
      await busy(btn, async () => {
        try {
          await api.reportContent({ reason: res.choice, details: res.text, requestId: id, submissionId: submission && submission.status !== 'borrador' ? submission.id : null });
          toast(t('reportSent'), 'ok');
        } catch (e) { toast(friendlyError(e), 'error'); }
      });
    },
    block: async (btn) => {
      const target = btn.dataset.user;
      if (!target || !(await confirmAction(t('block'), t('blockConfirm'), true))) return;
      await run(btn, () => api.blockUser(target), t('blocked'));
    },
  });

  void load();
  void syncServerTime();
  msgTimer = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshMessages(); }, 20000);
  // Actualiza el estado cuando la otra persona actúa (sin interrumpir si estás escribiendo o subiendo fotos).
  const stateTimer = window.setInterval(() => {
    const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
    if (document.visibilityState === 'visible' && !typing && !document.querySelector('.modal') && !photos.some((p) => p.status === 'uploading')) void load();
  }, 30000);
  return () => { disposed = true; reqMap?.destroy(); window.clearInterval(msgTimer); window.clearInterval(stateTimer); photos.forEach((p) => p.url.startsWith('blob:') && URL.revokeObjectURL(p.url)); };
}
