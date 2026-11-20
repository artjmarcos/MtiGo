# Informe final — MtiGo! MVP 0.1.0

Fecha: 20-11-2026. Todas las pruebas indicadas como ejecutadas se corrieron realmente en el entorno de desarrollo; los resultados se reproducen con los comandos indicados.

## 1. IMPLEMENTADO

**Autenticación y perfiles**
- Registro, inicio y cierre de sesión, recuperación de contraseña (enlace por correo hacia la versión web) con Supabase Auth.
- Perfil: nombre, ciudad, teléfono privado, preferencia de avisos. ID único (UUID). Sesión persistente (almacenamiento nativo en Android).
- Una cuenta puede ser solicitante y colaborador. Aceptación de términos obligatoria (registrada en servidor).

**Solicitudes**
- Crear con título, descripción, categoría, tipo de evidencia (foto / texto / foto + texto), recompensa CLP, dirección escrita, ubicación GPS opcional, radio (solo con GPS), vencimiento (30 min a 3 días).
- Validación en servidor; protección contra duplicados (ID de envío idempotente); límites anti-abuso (5 activas, 20 por día).
- Explorar: solo solicitudes reales (sin datos de demostración), tarjetas con todos los campos pedidos, filtros por categoría y recompensa, búsqueda por texto, "Cerca de mí" (5 km) y mapa OpenStreetMap.

**Flujo completo**
- Aceptación atómica (bloqueo de fila + índice único parcial). Valida usuario, disponibilidad, vencimiento, que no sea el propio solicitante, bloqueos y términos.
- Entrega de evidencia: texto + hasta 4 fotos comprimidas en el teléfono (máx. 1600 px), subidas a Storage **privado**; el servidor verifica que el archivo exista realmente antes de registrarlo.
- Revisión: aprobar o rechazar con motivo obligatorio; colaborador puede liberar; solicitante puede cancelar.
- Estados: Disponible, Aceptada, En proceso, Evidencia entregada, Aprobada, Rechazada, Vencida, Cancelada, con historial de transiciones (quién, cuándo, nota).
- Vencimiento automático (pg_cron opcional + limpieza al abrir la app + bloqueo en servidor).
- Mensajes entre solicitante y colaborador (del prototipo).

**Piloto**
- Historial de solicitudes y de colaboraciones, indicador de activas, avisos internos persistentes con contador.
- Reportar contenido (7 motivos), bloquear/desbloquear usuarios, ocultamiento automático con 3 reportes.
- Política de privacidad, términos, página de eliminación de cuenta; eliminación de cuenta en la app (borra fotos y datos).
- Aviso visible de "pagos aún no habilitados" en Explorar, Crear y Detalle. Sin billetera ni dinero simulado.
- Interfaz en español con textos centralizados (`src/i18n/es.ts`) para agregar inglés.

**Android**
- Proyecto Capacitor 8: `io.artjmarcos.mtigo`, nombre MtiGo!, targetSdk 36, minSdk 24, icono adaptativo, splash, orientación vertical, botón atrás de Android, sin respaldo en la nube de la sesión.
- Permisos: solo Internet y ubicación (primer plano). Cámara sin permiso (app de cámara del sistema).
- versionCode/versionName configurables; firma con llave de subida generada (RSA 4096, válida hasta 2054).
- Workflow de GitHub Actions que compila **AAB y APK firmados**.

## 2. PROBADO

| Prueba | Comando | Resultado |
|---|---|---|
| Typecheck (TypeScript estricto) | `npm run typecheck` | ✔ sin errores |
| Build de producción | `npm run build` | ✔ (JS 82 KB gzip + mapa 43 KB bajo demanda) |
| Pruebas unitarias | `npm run test:unit` | ✔ 21/21 (formato CLP, tiempos, validaciones, anti-XSS, rutas, errores, compresión) |
| Integración con PostgreSQL real + migración real | `npm run test:db` | ✔ 37/37 |
| Extremo a extremo, 3 "teléfonos" Chrome | `npm run test:e2e` | ✔ 31/31 (ejecutado 2 veces seguidas) |

Las pruebas de integración cubren: autenticación (anónimo bloqueado, token sin usuario, perfil automático), permisos (escritura directa denegada, funciones internas no invocables, datos privados), persistencia (reinicio completo del servidor PostgreSQL), **aceptación concurrente (2 y 8 colaboradores simultáneos → 1 sola asignación)**, entrega de evidencia (subida no autorizada rechazada, archivo inexistente rechazado, borrador invisible para el solicitante, máximo 4 fotos, rutas peligrosas rechazadas), aprobación y rechazo, solicitudes vencidas, bloqueos, reportes, eliminación de cuenta, re-ejecución de la migración, y un **contrato** que comprueba que cada llamada de la app existe en la base de datos con los mismos parámetros.

La prueba E2E usa los **binarios oficiales de Supabase Auth (v2.186.0) y PostgREST (v12.2.3)** con la migración real, más un emulador de Storage que aplica las mismas políticas RLS. Recorre el caso completo pedido (A crea → B se registra, encuentra, acepta, entrega foto y texto → A revisa y aprueba → ambos ven el historial → los datos persisten al cerrar y abrir), además de: usuario no autorizado, rechazo con motivo, doble aceptación simultánea desde dos teléfonos (un ganador; el otro ve "Otro colaborador aceptó esta solicitud primero"), solicitud vencida, geolocalización, mapa y eliminación de cuenta. Sin errores de JavaScript.

**No probado (no fue posible aquí):** compilación Gradle del AAB/APK, instalación en un teléfono Android real, cámara nativa, Supabase en la nube, envío real de correos, carga de teselas del mapa. Ver BLOQUEOS.

## 3. PENDIENTE (requiere tus datos o servicios)

1. Crear el proyecto Supabase nuevo y ejecutar la migración (docs/INSTALACION.md §1).
2. Configurar SMTP propio en Supabase para correos de confirmación y recuperación (el correo incluido envía muy pocos por hora).
3. Subir el código al repositorio y cargar los secretos de GitHub (§2–3).
4. Ejecutar los workflows: web/legales y Android → descargar AAB y APK.
5. Reemplazar **[CORREO DE CONTACTO — COMPLETAR ANTES DE PUBLICAR]** en `public/legal/*.html`. Revisión legal de los textos (no soy abogado; son una base razonable para un piloto, alineados con la Ley 19.628).
6. Play Console: crear la app, ficha, Data Safety, clasificación, cuenta de revisor, prueba cerrada con ≥12 testers durante 14 días (docs/PLAY_CONSOLE.md).
7. Probar en al menos 2 teléfonos reales (gama baja incluida) el caso completo.
8. Pausar o eliminar los dos proyectos Supabase antiguos.
9. Futuro: notificaciones push (Firebase Cloud Messaging), pagos con un proveedor de marketplace en Chile (tabla de recompensas ya separada para integrarlo), inglés, panel de moderación propio, Pucón (la ciudad ya existe desactivada en la tabla `cities`).

## 4. BLOQUEOS

| Bloqueo | Efecto | Solución |
|---|---|---|
| El entorno de desarrollo no tiene acceso a Google Maven / Gradle | No pude generar aquí el AAB/APK | El workflow `android.yml` compila en GitHub Actions; requiere que el código esté en el repo y los secretos cargados |
| El entorno no puede conectarse a Supabase en la nube | No pude ejecutar la migración ni probar contra tu proyecto | Ejecutar la migración en el SQL Editor (§1). Validada aquí con PostgreSQL + Supabase Auth + PostgREST oficiales |
| GitHub no está conectado con permiso de escritura | No pude subir los cambios | Conecta GitHub (Ajustes → Conectores) o sube el ZIP manualmente |
| Sin SMTP configurado | Con el correo por defecto de Supabase, el piloto puede quedarse sin correos de confirmación | Configurar Resend/Brevo |
