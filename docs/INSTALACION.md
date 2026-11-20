# Puesta en marcha de MtiGo! (paso a paso, desde el celular)

Todo se puede hacer desde el navegador del teléfono. Tiempo estimado: 40–60 minutos.

## 1. Crear el proyecto Supabase (gratis)

1. Entra a <https://supabase.com> → **New project**.
   - Nombre: `mtigo` · Región: **South America (São Paulo)** · Guarda la contraseña de la base de datos.
2. Ve a **SQL Editor → New query**, pega TODO el contenido de
   `supabase/migrations/20261120000001_mtigo_mvp.sql` y toca **Run**. Debe terminar sin errores.
3. (Recomendado) **Database → Extensions** → activa `pg_cron`. Luego ejecuta en el SQL Editor
   `supabase/migrations/20261120000002_vencimiento_automatico.sql`.
4. **Authentication → URL Configuration**:
   - Site URL: `https://artjmarcos.github.io/mtigo/`
   - Redirect URLs: agrega `https://artjmarcos.github.io/mtigo/**`
5. **Authentication → Sign In / Providers → Email**: deja activo "Confirm email".
6. **Correos (importante):** el correo incluido en Supabase envía muy pocos mensajes por hora (solo sirve para probar).
   Para el piloto configura un SMTP propio en **Authentication → Emails → SMTP Settings**
   (por ejemplo Resend o Brevo, ambos con plan gratuito).
7. **Project Settings → API**: copia
   - `Project URL` → será `VITE_SUPABASE_URL`
   - `anon public` key → será `VITE_SUPABASE_ANON_KEY`
   - ⚠️ Nunca copies la `service_role` key en ningún lugar de la app.

> Los proyectos antiguos (`auouhuhm…` y `tjyaqoz…`) no se usan. Revisa que no tengan datos reales y luego pausa o elimina esos proyectos.

## 2. Subir el código a GitHub

Reemplaza el contenido del repositorio `artjmarcos/mtigo` con este proyecto (o deja que Claude lo suba si conectas GitHub con permiso de escritura).

## 3. Configurar secretos en GitHub

En el repositorio: **Settings → Secrets and variables → Actions**.

**Secrets** (pestaña *Secrets*):

| Nombre | Valor |
|---|---|
| `VITE_SUPABASE_URL` | Project URL de Supabase |
| `VITE_SUPABASE_ANON_KEY` | anon public key |
| `MTIGO_KEYSTORE_BASE64` | contenido completo de `mtigo-upload.jks.base64.txt` |
| `MTIGO_KEYSTORE_PASSWORD` | ver `CLAVES-FIRMA-MTIGO.txt` |
| `MTIGO_KEY_ALIAS` | `mtigo-upload` |
| `MTIGO_KEY_PASSWORD` | ver `CLAVES-FIRMA-MTIGO.txt` |

**Variables** (pestaña *Variables*):

| Nombre | Valor |
|---|---|
| `VITE_PUBLIC_WEB_URL` | `https://artjmarcos.github.io/mtigo/` |
| `VITE_SUPPORT_EMAIL` | tu correo de contacto |

> 🔐 **La llave de firma (`mtigo-upload.jks`) y sus contraseñas son críticas.** Guárdalas en un lugar seguro
> (por ejemplo, Google Drive privado + un gestor de contraseñas). No las subas al repositorio.
> Si se pierden, Google Play permite restablecer la llave de subida, pero el trámite toma días.

## 4. Publicar la web y los documentos legales

1. **Settings → Pages → Source:** "GitHub Actions".
2. **Actions → "Web y documentos legales" → Run workflow**.
3. Revisa que abran:
   - App web: `https://artjmarcos.github.io/mtigo/`
   - Privacidad: `https://artjmarcos.github.io/mtigo/legal/privacidad.html`
   - Eliminar cuenta: `https://artjmarcos.github.io/mtigo/legal/eliminar-cuenta.html`
4. Antes de publicar en Play, edita en `public/legal/*.html` el texto **[CORREO DE CONTACTO — COMPLETAR ANTES DE PUBLICAR]**.

## 5. Generar el AAB y el APK

1. **Actions → "Android (AAB + APK)" → Run workflow**.
   - `version_code`: `1` (súbelo en cada envío: 2, 3, 4…)
   - `version_name`: `0.1.0`
2. Al terminar (≈10 min), abre la ejecución → **Artifacts** → descarga el ZIP.
   Contiene `MtiGo-0.1.0-1.aab` (Google Play) y `MtiGo-0.1.0-1.apk` (instalación directa).

## 6. Probar en dos teléfonos (caso completo)

1. Instala el APK en dos teléfonos (permitir "instalar apps desconocidas") o súbelo a la prueba cerrada.
2. Teléfono A: **Crear cuenta** → confirma el correo → **Ingresar** → **＋ Pedir** → publica una solicitud.
3. Teléfono B: crea otra cuenta → **Explorar** → abre la solicitud → **Aceptar** → toma una foto,
   escribe la respuesta → **Enviar evidencia**.
4. Teléfono A: **Avisos** → abre la solicitud → revisa foto y texto → **Aprobar** (o **Rechazar** con motivo).
5. Ambos: **Actividad** → historial. Cierra y vuelve a abrir la app: la sesión y los datos siguen ahí.

## 7. Desarrollo local (opcional, computador)

```bash
cp .env.example .env    # completa los valores
npm ci && npm run dev   # abre http://localhost:5173
```
