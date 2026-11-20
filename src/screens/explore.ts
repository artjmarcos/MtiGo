import { t } from '../i18n';
import { html, mount, $, onAction, raw } from '../lib/dom';
import { emptyState, errorState, paymentsNotice, spinner, toast } from '../lib/ui';
import { listAvailable, expireOverdue, type ListedRequest } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { getCurrentPosition } from '../lib/geo';
import { formatClp } from '../lib/format';
import { config } from '../config';
import { state, cityName, categoryOf } from '../state';
import { requestCard } from './components';
import { escapeHtml } from '../lib/dom';

// Los filtros se conservan mientras la app esté abierta.
const filters = {
  category: null as string | null,
  minReward: null as number | null,
  search: '',
  near: false,
  view: 'list' as 'list' | 'map',
};
let lastExpireCall = 0;

export function renderExplore(root: HTMLElement): () => void {
  const city = state.profile?.city_slug ?? config.defaultCity;
  let items: ListedRequest[] = [];
  let mapCleanup: (() => void) | null = null;
  let searchTimer: number | undefined;

  mount(root, html`
    <header class="topbar"><h1>${t('exploreTitle')} ${cityName(city)}</h1><div class="spacer"></div>
      <button class="icon-btn" data-action="refresh" aria-label="${t('refresh')}">⟳</button></header>
    <div class="content">
      ${paymentsNotice()}
      <input class="input search" id="q" type="search" placeholder="${t('search')}" value="${filters.search}" aria-label="${t('search')}" />
      <div class="chips" role="group" aria-label="Categorías">
        <button class="chip-btn ${filters.category === null ? 'on' : ''}" data-action="cat" data-slug="">${t('allCategories')}</button>
        ${state.categories.map((c) => html`<button class="chip-btn ${filters.category === c.slug ? 'on' : ''}" data-action="cat" data-slug="${c.slug}">${c.icon} ${c.name_es}</button>`)}
      </div>
      <div class="row gap wrap">
        <select class="input input-sm" id="reward" aria-label="Recompensa mínima">
          <option value="">${t('anyReward')}</option>
          ${[1000, 3000, 5000, 10000].map((v) => html`<option value="${v}" ${filters.minReward === v ? raw('selected') : ''}>≥ ${formatClp(v)}</option>`)}
        </select>
        <button class="btn btn-sm ${filters.near ? 'btn-teal' : 'btn-secondary'}" data-action="near">📍 ${filters.near ? t('nearMeOn') : t('nearMe')}</button>
        <div class="seg" role="tablist">
          <button class="${filters.view === 'list' ? 'on' : ''}" data-action="view" data-v="list">${t('list')}</button>
          <button class="${filters.view === 'map' ? 'on' : ''}" data-action="view" data-v="map">${t('map')}</button>
        </div>
      </div>
      <div id="results"></div>
    </div>`);

  const results = $('#results', root);

  async function load(): Promise<void> {
    mount(results, spinner());
    try {
      if (Date.now() - lastExpireCall > 120000) {
        lastExpireCall = Date.now();
        await expireOverdue().catch(() => 0); // limpieza perezosa; pg_cron la hace también
      }
      const coords = filters.near ? state.lastCoords : null;
      items = await listAvailable({
        citySlug: city, category: filters.category, minReward: filters.minReward, search: filters.search.trim(),
        lat: coords?.lat ?? null, lng: coords?.lng ?? null, radiusKm: coords ? 5 : null,
      });
      await draw();
    } catch (e) {
      mount(results, errorState(friendlyError(e)));
    }
  }

  async function draw(): Promise<void> {
    mapCleanup?.(); mapCleanup = null;
    if (!items.length) { mount(results, emptyState(t('emptyExplore'))); return; }
    if (filters.view === 'list') {
      mount(results, html`<p class="muted small">${items.length} disponibles</p><div class="list">${items.map((r) => requestCard(r))}</div>`);
      return;
    }
    const withCoords = items.filter((r) => r.lat !== null && r.lng !== null);
    const without = items.length - withCoords.length;
    mount(results, html`<div id="map" class="map" role="region" aria-label="Mapa de solicitudes"></div>
      ${without ? html`<p class="muted small">${without} ${t('noCoordsNote')}</p>` : ''}`);
    mapCleanup = await drawMap($('#map', results), withCoords);
  }

  onAction(root, {
    refresh: () => void load(),
    retry: () => void load(),
    cat: (el) => {
      filters.category = el.dataset.slug || null;
      root.querySelectorAll('[data-action="cat"]').forEach((b) => b.classList.toggle('on', b === el));
      void load();
    },
    view: (el) => {
      filters.view = el.dataset.v === 'map' ? 'map' : 'list';
      root.querySelectorAll('[data-action="view"]').forEach((b) => b.classList.toggle('on', b === el));
      void draw();
    },
    near: async (el) => {
      if (filters.near) { filters.near = false; el.className = 'btn btn-sm btn-secondary'; el.textContent = `📍 ${t('nearMe')}`; void load(); return; }
      el.textContent = '📍 …';
      try {
        state.lastCoords = await getCurrentPosition();
        filters.near = true;
        el.className = 'btn btn-sm btn-teal';
        el.textContent = `📍 ${t('nearMeOn')}`;
        void load();
      } catch {
        el.textContent = `📍 ${t('nearMe')}`;
        toast(t('locationDenied'), 'error');
      }
    },
  });

  ($('#reward', root) as HTMLSelectElement).addEventListener('change', (ev) => {
    const v = (ev.target as HTMLSelectElement).value;
    filters.minReward = v ? Number(v) : null;
    void load();
  });
  $('#q', root).addEventListener('input', (ev) => {
    filters.search = (ev.target as HTMLInputElement).value;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void load(), 400);
  });

  void load();
  const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 90000);
  return () => { window.clearInterval(timer); window.clearTimeout(searchTimer); mapCleanup?.(); };
}

/** Mapa real de OpenStreetMap con atribución obligatoria (sin costo, sin clave). */
async function drawMap(el: HTMLElement, items: ListedRequest[]): Promise<() => void> {
  const L = (await import('leaflet')).default;
  await import('leaflet/dist/leaflet.css');
  const center = state.lastCoords ?? config.defaultCenter;
  const map = L.map(el, { zoomControl: true, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false }).setView([center.lat, center.lng], 14);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  if (state.lastCoords) {
    L.circleMarker([state.lastCoords.lat, state.lastCoords.lng], { radius: 8, color: '#009688', fillOpacity: 0.9 }).addTo(map).bindTooltip('Tú');
  }
  const bounds: [number, number][] = [];
  for (const r of items) {
    const cat = categoryOf(r.category_slug);
    const icon = L.divIcon({
      className: 'pin',
      html: `<div class="pin-inner">${cat.icon} ${escapeHtml(formatClp(r.reward_clp))}</div>`,
      iconSize: [84, 30], iconAnchor: [42, 15],
    });
    const lat = Number(r.lat); const lng = Number(r.lng);
    bounds.push([lat, lng]);
    L.marker([lat, lng], { icon, title: r.title }).addTo(map)
      .on('click', () => { location.hash = `#/solicitud/${r.id}`; });
  }
  if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16, animate: false });
  else if (bounds.length === 1) map.setView(bounds[0], 16, { animate: false });
  const t = window.setTimeout(() => map.invalidateSize({ animate: false }), 50);
  return () => { window.clearTimeout(t); map.stop(); map.off(); map.remove(); };
}
