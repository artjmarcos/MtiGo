# Ingreso con Google (y Facebook) — configuración

Los botones solo aparecen en la app cuando el proveedor está configurado **y** su nombre figura en la variable
de GitHub `VITE_AUTH_PROVIDERS` (por ejemplo `google` o `google,facebook`). Así nunca se muestran botones que no funcionan.

> Yahoo no es un proveedor disponible en Supabase, por eso no se incluye.

## Google (gratis, ~15 minutos, desde el PC)

### 1. Google Cloud
1. Entra a <https://console.cloud.google.com/> con tu cuenta de Google → crea un proyecto llamado `MtiGo`.
2. **APIs y servicios → Pantalla de consentimiento de OAuth** (o "Google Auth Platform"):
   - Tipo: **Externo**. Nombre de la app: `MtiGo!`. Correo de asistencia: `artejmarcos@gmail.com`.
   - Logo: `store/play-icon-512.png` (opcional).
   - Dominios autorizados: `supabase.co` y `github.io`.
   - Enlace a política de privacidad: `https://artjmarcos.github.io/MtiGo/legal/privacidad.html`
   - Permisos: solo `email`, `profile`, `openid` (los básicos; no requieren verificación).
   - Publica la app (estado **En producción**) para que cualquiera pueda entrar, no solo usuarios de prueba.
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**:
   - Tipo de aplicación: **Aplicación web**. Nombre: `MtiGo Supabase`.
   - **URI de redireccionamiento autorizados:** `https://vvccxexegswnsmqwllyl.supabase.co/auth/v1/callback`
   - Crear → copia el **ID de cliente** y el **Secreto del cliente**.

### 2. Supabase
1. **Authentication → Sign In / Providers → Google** → activar.
2. Pega el **Client ID** y el **Client Secret** → **Save**.
3. **Authentication → URL Configuration → Redirect URLs** → agrega también:
   `io.artjmarcos.mtigo://login-callback`
   (además de `https://artjmarcos.github.io/MtiGo/**` que ya está).

### 3. GitHub
1. **Settings → Secrets and variables → Actions → Variables → New repository variable**
   - Name: `VITE_AUTH_PROVIDERS` · Value: `google`
2. Vuelve a ejecutar **Web y documentos legales** y **Android (AAB + APK)** (sube el `version_code`: `2`).

## Facebook (opcional, más trámite)
1. <https://developers.facebook.com/> → crear app tipo **Consumidor** → producto **Inicio de sesión con Facebook**.
2. URI de redireccionamiento OAuth válido: `https://vvccxexegswnsmqwllyl.supabase.co/auth/v1/callback`.
3. Copia **ID de la app** y **Clave secreta** en Supabase → Providers → Facebook.
4. Mientras la app de Meta esté en "modo desarrollo", solo podrán entrar personas agregadas como testers.
   Para el público, Meta exige verificación (política de privacidad, eliminación de datos, ícono, a veces verificación de empresa).
5. Cuando esté lista: `VITE_AUTH_PROVIDERS` = `google,facebook`.

## Cómo funciona en la app
- **Web:** redirección normal a Google y vuelta a la página.
- **Android:** se abre una pestaña segura del sistema (Custom Tabs) y Google devuelve a la app por
  `io.artjmarcos.mtigo://login-callback`.
- La primera vez, la persona ve **"Antes de comenzar"** y debe aceptar términos y privacidad (no se aceptan solos).
- El nombre del perfil se toma de la cuenta de Google; se puede cambiar en Perfil.
- Requiere ejecutar en Supabase la migración `supabase/migrations/20261121000001_ingreso_social.sql`.

## Botones con la marca oficial
Los botones usan texto ("Continuar con Google"). Si quieres el botón con el logotipo oficial de Google,
descárgalo desde las pautas de marca de Google Identity y reemplázalo en `src/screens/auth.ts`.
