# Registro de cambios

## 0.1.0 — 20-11-2026 (MVP para prueba cerrada)

### Diagnóstico del proyecto anterior (Fase 1)
- El repositorio tenía 3 archivos: `README.md`, `index.html` (prototipo "Modo Demo") e `Index` (prototipo conectado a Supabase, sin extensión `.html`).
- Problemas encontrados:
  - Sin autenticación: el usuario se elegía por un teléfono fijo en el código (`+56912345678`).
  - Billetera simulada: el saldo se descontaba desde el teléfono del usuario (manipulable).
  - Sin esquema SQL versionado; dos proyectos Supabase distintos en cada archivo.
  - Sin aceptación atómica, sin fotos reales, sin historial, sin proyecto Android.
- Los prototipos se **conservan** en `legacy/` (no se borró nada).

### Qué se conservó del prototipo
- Tecnología web + Supabase (empaquetada ahora con Capacitor en lugar de migrar a Flutter/Firebase).
- Pantalla de bienvenida, mapa (Leaflet/OpenStreetMap), creación de solicitudes con monto, respuesta con foto, chat entre solicitante y colaborador, uso de geolocalización.

### Qué se eliminó por exigencia del documento
- Billetera, saldo y descuentos simulados (regla innegociable de pagos).
- Pines de demostración presentados como solicitudes reales.
- Avatares de terceros (dicebear) cargados desde internet.

### Nuevo
- `supabase/migrations/…_mtigo_mvp.sql`: esquema completo con RLS, funciones de servidor, Storage privado, historial, avisos, reportes, bloqueos, eliminación de cuenta.
- App completa en `src/` (ver README).
- Proyecto Android `android/` (`io.artjmarcos.mtigo`), icono, splash, permisos mínimos, firma por variables de entorno.
- Workflows de GitHub Actions: AAB/APK firmados, publicación web/legal, pruebas.
- Pruebas: 21 unitarias, 37 de integración con PostgreSQL real, 31 verificaciones extremo a extremo.
- Documentos legales y guía de Google Play.

### Commits
1. Esquema PostgreSQL/Supabase + 35 pruebas de integración.
2. App móvil, legales, pruebas unitarias, contrato y E2E.
3. Proyecto Android y workflows.
4. Documentación e informe.
