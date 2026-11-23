# Auditoría de seguridad — MtiGo! v0.4.1

Fecha: 23-11-2026 · Alcance: base de datos y permisos (Supabase/PostgreSQL), almacenamiento de fotos,
ingreso y sesiones, aplicación (web/Android), compilación (GitHub Actions) y datos personales.

Método: revisión del código y de los permisos, más **ataques reales** contra una base de datos PostgreSQL con
la migración de producción. Cada falla encontrada se demostró con una prueba antes de corregirla, y la prueba
queda permanente en `tests/db/seguridad.test.mjs` y `tests/unit/oauth.test.ts`.

## Resultado general

| Área | Estado |
|---|---|
| Permisos de base de datos (RLS) | ✅ Todas las tablas protegidas; los clientes no pueden escribir directamente |
| Usuarios anónimos | ✅ No pueden ejecutar ninguna función ni leer datos (solo ciudades y categorías) |
| Fotos privadas | ✅ Solo solicitante y colaborador; enlaces temporales de 1 hora |
| Aceptación simultánea | ✅ Solo uno gana (bloqueo de fila + índice único) |
| Dependencias (npm audit) | ✅ 0 vulnerabilidades conocidas |
| Secretos en el código | ✅ No hay claves privadas; la llave de firma no está en el repositorio |
| Android | ✅ Sin respaldo en la nube de la sesión, sin depuración, sin tráfico sin cifrar, permisos mínimos |
| Seguridad del navegador (CSP) | ✅ Solo scripts propios; sin iframes ni plugins |

## Fallas encontradas y corregidas

| # | Severidad | Falla (demostrada) | Corrección |
|---|---|---|---|
| S1 | Media | Cualquier usuario podía averiguar si una persona bloqueó a otra | `_is_blocked_between` solo responde si uno mismo está involucrado |
| S2 | Media | Cualquier usuario podía averiguar quién colabora en una solicitud ajena | `is_request_participant` / `is_request_owner` solo responden sobre uno mismo |
| S3 | Media | El colaborador podía borrar la foto **después** de entregarla (destruir la prueba) | Solo se borra en borrador, o durante la eliminación de la cuenta (`request_account_deletion`) |
| S4 | Baja | Se podían subir archivos sin límite al borrador (abuso de almacenamiento) | Máximo 8 archivos por borrador en Storage |
| S5 | Baja | Se podía reportar una solicitud privada que uno no puede ver | Solo se reporta lo que uno puede ver |
| S6 | Media | En Android, un enlace malicioso `io.artjmarcos.mtigo://login-callback#access_token=…` podía iniciar sesión con la cuenta de otra persona (inyección de sesión) | La app solo acepta la vuelta si inició el ingreso hace menos de 10 minutos |
| S7 | Baja | El icono de categoría se insertaba sin escapar en el mapa | Se escapa (defensa en profundidad; solo lo edita el administrador) |

Migración a ejecutar: `supabase/migrations/20261123000002_seguridad.sql`.

## Fortalezas ya presentes
- Todas las escrituras pasan por funciones de servidor que validan permisos, estados, plazos y límites.
- Límites anti-abuso: 5 solicitudes activas, 20 por día, 3 colaboraciones activas, 15 mensajes por minuto, 20 reportes por día.
- Fotos tomadas solo con la cámara de la app, con marca de agua y hora del servidor. Al procesarlas en la app se eliminan los
  metadatos EXIF (incluida la ubicación GPS del teléfono).
- El teléfono del usuario es privado. La ubicación del dispositivo solo se usa cuando la persona lo pide y solo se guarda si
  la adjunta a una solicitud.
- Eliminación de cuenta completa desde la app (cuenta, solicitudes, evidencias, fotos, mensajes y avisos).
- Moderación: reportes, bloqueo y ocultamiento automático con 3 reportes.
- Errores sin detalles internos para el usuario.

## Pendientes de configuración (requieren tu acceso)

| Prioridad | Dónde | Acción |
|---|---|---|
| Alta | Supabase | **Eliminar los 2 proyectos antiguos** (MtiGo `us-west-2` y MtiGoapp `sa-east-1`). Sus claves aparecen en los prototipos publicados en `legacy/` y no tenían reglas de seguridad. |
| Alta | Supabase → Authentication → Providers → Email | Contraseña mínima **8 caracteres** con letras y números (hoy solo lo exige la app) y "Secure email change" activado. |
| Alta | Supabase → Authentication | Configurar SMTP propio (los correos por defecto tienen límites muy bajos). |
| Media | Supabase → Authentication → URL Configuration | Dejar solo las URL de redirección propias (`https://artjmarcos.github.io/MtiGo/**` y `io.artjmarcos.mtigo://login-callback`). |
| Media | GitHub → Settings → Code security | Activar **Dependabot alerts** y **Secret scanning** (el archivo `.github/dependabot.yml` ya está). |
| Media | Personal | Guardar la llave de firma en dos lugares seguros y activar verificación en dos pasos en GitHub, Google y Supabase. |
| Baja | Supabase (plan Pro) | "Leaked password protection" bloquea contraseñas filtradas. |

## Riesgos aceptados para el piloto
- La ubicación de una solicitud es visible para usuarios de la ciudad mientras está disponible (es necesario para que la ayuden).
  Se recomienda no usar la dirección de la casa propia.
- Los nombres visibles se muestran a otros usuarios (sin correo ni teléfono).
- Una persona podría fotografiar una pantalla con una foto antigua; la marca de agua con hora del servidor y el código de la
  solicitud lo dificultan, y el solicitante puede rechazar y reportar.
- Pagos deshabilitados: no hay riesgos financieros en esta versión.

## Pruebas
- Integración con PostgreSQL real: **44/44** (incluye 6 de seguridad).
- Unitarias: **28/28** (incluye 4 del ingreso social).
- Extremo a extremo con 3 teléfonos simulados: **38/38**.
