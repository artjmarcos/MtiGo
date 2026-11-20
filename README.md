# MtiGo! — información real del lugar, antes de ir

Marketplace de información hiperlocal en tiempo real. Piloto: **Villarrica, Región de La Araucanía, Chile**.

- **Solicitante:** publica qué necesita saber (¿hay fila en el banco?, ¿está abierta la tienda?) y ofrece una recompensa referencial en CLP.
- **Colaborador:** acepta una solicitud cercana, va al lugar y entrega evidencia con fotos y/o texto.
- La misma cuenta puede cumplir ambos roles.

> **Pagos deshabilitados.** La recompensa es solo informativa. No hay billetera, saldo, cobros ni transferencias (ni reales ni simulados).

## Tecnología

| Parte | Elección | Motivo |
|---|---|---|
| App | TypeScript + Vite (web), empaquetada con **Capacitor 8** para Android | Continúa el prototipo HTML/Supabase existente; un solo código para Android y web |
| Backend | **Supabase** (PostgreSQL, Auth, Storage) | Ya usado por el prototipo; plan gratuito suficiente para el piloto |
| Seguridad | Row Level Security + funciones de servidor (RPC) | Toda escritura se valida en el servidor |
| Mapas | Leaflet + OpenStreetMap | Sin clave ni facturación |

Android: `io.artjmarcos.mtigo`, minSdk 24 (Android 7), targetSdk 36.

## Estructura

```
src/                      App (pantallas en src/screens, lógica en src/lib)
supabase/migrations/      Esquema de base de datos (ejecutar en Supabase)
public/legal/             Política de privacidad, términos, eliminación de cuenta
android/                  Proyecto Android (Capacitor)
tests/unit/               Pruebas unitarias (Vitest)
tests/db/                 Pruebas de integración con PostgreSQL real
tests/e2e/                Prueba extremo a extremo con dos teléfonos (Chrome)
.github/workflows/        Compilación AAB/APK, publicación web y pruebas
docs/                     Instalación, Google Play, cambios e informe
legacy/                   Prototipos anteriores (conservados)
```

## Comandos

```bash
npm ci
npm run typecheck     # verificación de tipos
npm run test:unit     # pruebas unitarias
npm run test:db       # integración con PostgreSQL real (descarga PostgreSQL embebido)
npm run build         # build de producción (requiere .env)
npm run android:sync  # build + copia al proyecto Android
```

Guías: [docs/INSTALACION.md](docs/INSTALACION.md) · [docs/PLAY_CONSOLE.md](docs/PLAY_CONSOLE.md) · [docs/INFORME.md](docs/INFORME.md) · [docs/CAMBIOS.md](docs/CAMBIOS.md)
