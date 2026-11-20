// Geolocalización real del dispositivo (solo si el usuario la autoriza).
// En Android, el WebView de Capacitor solicita el permiso de ubicación.
export interface Coords { lat: number; lng: number; accuracy: number }

export function getCurrentPosition(timeoutMs = 12000): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new Error('Geolocalización no disponible')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: round6(p.coords.latitude), lng: round6(p.coords.longitude), accuracy: Math.round(p.coords.accuracy) }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 },
    );
  });
}

export function round6(n: number): number { return Math.round(n * 1e6) / 1e6; }

export function mapsLink(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
}
