# Mapas

| Vista | Proveedor | Costo | Clave |
|---|---|---|---|
| 🛰️ Satélite (predeterminada) | Esri World Imagery + capas de calles y nombres de Esri | Gratis en el piloto | No |
| 🗺️ Calles | OpenStreetMap | Gratis (uso moderado) | No |

- El botón del mapa alterna entre satélite y calles; la app recuerda la elección.
- La atribución exigida ("Powered by Esri…", "© OpenStreetMap") aparece siempre en el mapa.
- Los mapas se cargan solo cuando se abren (ahorro de datos en teléfonos económicos).

**Antes de un lanzamiento comercial a gran escala:** Esri pide usar una clave de *ArcGIS Location Platform*
(tiene un nivel gratuito amplio) y los servidores de teselas de OpenStreetMap no admiten uso intensivo.
Alternativas con nivel gratuito y clave: MapTiler, Stadia Maps. El cambio se hace en `src/lib/map.ts`.
