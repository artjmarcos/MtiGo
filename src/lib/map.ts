// Mapas reales sin costo: satélite (Esri World Imagery) con calles y nombres
// superpuestos, o mapa de calles (OpenStreetMap). Se cargan bajo demanda.
// Atribución obligatoria incluida. Para uso comercial a gran escala, Esri pide
// una clave de ArcGIS Location Platform (ver docs/MAPAS.md).
import type * as Leaflet from 'leaflet';

export type MapStyle = 'satelite' | 'calles';
const STYLE_KEY = 'mtigo.mapStyle';

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const ESRI_ATTR = 'Powered by <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a> | Esri, Maxar, Earthstar Geographics y la comunidad GIS';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

export function preferredStyle(): MapStyle {
  try { return localStorage.getItem(STYLE_KEY) === 'calles' ? 'calles' : 'satelite'; } catch { return 'satelite'; }
}
function rememberStyle(s: MapStyle): void {
  try { localStorage.setItem(STYLE_KEY, s); } catch { /* sin almacenamiento */ }
}

export interface MtigoMap {
  L: typeof Leaflet;
  map: Leaflet.Map;
  setStyle(s: MapStyle): void;
  destroy(): void;
}

export async function createMap(el: HTMLElement, center: { lat: number; lng: number }, zoom = 15): Promise<MtigoMap> {
  const L = (await import('leaflet')).default;
  await import('leaflet/dist/leaflet.css');
  const map = L.map(el, { zoomControl: true, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false, attributionControl: true })
    .setView([center.lat, center.lng], zoom, { animate: false });
  map.attributionControl.setPrefix(false);

  const satellite = L.layerGroup([
    L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 20, maxNativeZoom: 19, attribution: ESRI_ATTR }),
    L.tileLayer(`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 20, maxNativeZoom: 19, opacity: 0.85 }),
    L.tileLayer(`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 20, maxNativeZoom: 19 }),
  ]);
  const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: OSM_ATTR });

  let current: MapStyle = preferredStyle();
  const apply = (s: MapStyle) => {
    current = s;
    if (s === 'satelite') { map.removeLayer(streets); satellite.addTo(map); } else { map.removeLayer(satellite); streets.addTo(map); }
    btn.textContent = s === 'satelite' ? '🗺️ Mapa' : '🛰️ Satélite';
    btn.setAttribute('aria-label', s === 'satelite' ? 'Cambiar a mapa de calles' : 'Cambiar a vista satelital');
  };

  // Botón Satélite / Mapa.
  const Toggle = L.Control.extend({
    onAdd() {
      const b = L.DomUtil.create('button', 'map-toggle') as HTMLButtonElement;
      b.type = 'button';
      L.DomEvent.disableClickPropagation(b);
      L.DomEvent.on(b, 'click', (e) => { L.DomEvent.preventDefault(e); const next = current === 'satelite' ? 'calles' : 'satelite'; rememberStyle(next); apply(next); });
      return b;
    },
  });
  const control = new Toggle({ position: 'topright' });
  control.addTo(map);
  const btn = control.getContainer() as HTMLButtonElement;
  apply(current);

  const t = window.setTimeout(() => map.invalidateSize({ animate: false }), 60);
  return {
    L, map,
    setStyle: apply,
    destroy: () => { window.clearTimeout(t); map.stop(); map.off(); map.remove(); },
  };
}

/** Icono de pin con el estilo de MtiGo! para un marcador. */
export function pinIcon(L: typeof Leaflet, label?: string): Leaflet.DivIcon {
  return L.divIcon({
    className: 'pin',
    html: label
      ? `<div class="pin-inner">${label}</div>`
      : '<div class="pin-drop"><span>!</span></div>',
    iconSize: label ? [96, 32] : [36, 46],
    iconAnchor: label ? [48, 16] : [18, 44],
  });
}
