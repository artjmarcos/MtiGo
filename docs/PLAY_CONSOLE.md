# Google Play Console — preparación para prueba cerrada

> Este documento deja la app **técnicamente preparada** para cargarla en Google Play. No significa que Google la haya aprobado.

## Datos técnicos

| Campo | Valor |
|---|---|
| Nombre de la app | MtiGo! |
| Paquete | `io.artjmarcos.mtigo` (no se puede cambiar después de la primera subida) |
| Formato | Android App Bundle (`.aab`) firmado con la llave de subida `mtigo-upload` |
| Firma | Activar **Play App Signing** (Google guarda la llave final; tú solo la de subida) |
| targetSdk / minSdk | 36 (Android 16) / 24 (Android 7.0). Desde el 31-08-2026 Google Play exige API 36 en apps nuevas: cumplido |
| versionCode / versionName | 1 / 0.1.0 (súbelos en cada envío; se eligen al ejecutar el workflow) |
| Huella SHA-256 de la llave de subida | ver `fp.txt` entregado junto con la llave |

## Requisito de prueba cerrada (cuenta personal)

Las cuentas personales creadas después del 13-11-2023 deben, **para cada app nueva**, tener una prueba cerrada con al menos **12 testers inscritos durante 14 días seguidos** antes de pedir acceso a producción. Que lo cumplieras con MahjongWT no exime a MtiGo!. Recluta más de 12 (por ejemplo 15–20) personas de Villarrica: así también sirven como piloto real.

## Ficha de Play Store

**Nombre:** MtiGo!

**Descripción breve (máx. 80):**
`Pregunta cómo está un lugar antes de ir: fotos y respuestas de gente que está ahí`

**Descripción completa:**
```
¿Hay fila en el banco? ¿Está abierta la farmacia? ¿Cómo está la sala de urgencias?
Con MtiGo! le preguntas a personas que están en el lugar y te responden con fotos y texto antes de que salgas.

CÓMO FUNCIONA
• Publica una solicitud: qué necesitas saber, dónde, qué evidencia quieres (foto, texto o ambas) y hasta cuándo.
• Un colaborador cercano la acepta, va al lugar y entrega la evidencia.
• Revisas la respuesta y la apruebas o rechazas explicando el motivo.
• Todo queda en tu historial.

TAMBIÉN PUEDES AYUDAR
Con la misma cuenta puedes ser colaborador: revisa solicitudes cercanas, acepta una y responde.

PRIVACIDAD Y SEGURIDAD
• Las fotos de evidencia son privadas: solo las ven el solicitante y el colaborador.
• Tu teléfono nunca se muestra a otros usuarios.
• Tu ubicación solo se usa cuando tú lo pides.
• Puedes reportar contenido, bloquear usuarios y eliminar tu cuenta cuando quieras.

PILOTO EN VILLARRICA
MtiGo! está en etapa piloto en Villarrica, Región de La Araucanía.
Los pagos aún no están habilitados: la recompensa que indicas es solo referencial y la app no cobra ni transfiere dinero.

NUESTRA HISTORIA
MtiGo! nació en Villarrica para Mati, una joven para quien la incertidumbre de salir es muy difícil. Su nombre viene de "Mati" y "go" (ir). Creemos que saber antes de salir puede hacer la vida más tranquila para muchas personas: familias, adultos mayores y quienes viven con ansiedad. Por eso creamos una comunidad que presta sus ojos a otros.
```

**Categoría:** Viajes y guías locales (alternativa: Herramientas) · **Etiquetas:** información local, comunidad.

**Gráficos (incluidos en `store/` y `screenshots/`):**
- Icono 512×512: `store/play-icon-512.png`
- Gráfico destacado 1024×500: `store/play-feature-1024x500.png`
- Capturas de teléfono 1080×2160: `screenshots/*.png` (sacadas de la app real durante la prueba extremo a extremo; sube de 4 a 8).

**Contacto:** correo de soporte (obligatorio) y URL del sitio: `https://artjmarcos.github.io/MtiGo/`.

## Política de privacidad
URL: `https://artjmarcos.github.io/MtiGo/legal/privacidad.html` (publicada por el workflow "Web y documentos legales"). Completa antes el correo de contacto en el archivo.

## Eliminación de cuenta (obligatorio)
- Dentro de la app: Perfil → Eliminar mi cuenta.
- URL web para el formulario de Play: `https://artjmarcos.github.io/MtiGo/legal/eliminar-cuenta.html`

## Formulario "Seguridad de los datos" (Data Safety)

| Pregunta | Respuesta |
|---|---|
| ¿Recopila o comparte datos? | Sí recopila; **no comparte** con terceros (Supabase es un encargado de tratamiento, no un tercero) |
| ¿Datos cifrados en tránsito? | Sí (HTTPS) |
| ¿El usuario puede pedir que se borren? | Sí (en la app y vía web) |

Datos recopilados (todos: **recopilados, no compartidos, necesarios para la función de la app**, no opcionales salvo donde se indica):

| Tipo de dato | Uso |
|---|---|
| Información personal → Nombre | Funcionalidad de la app, gestión de la cuenta |
| Información personal → Correo electrónico | Gestión de la cuenta |
| Información personal → Teléfono | **Opcional**. Gestión de la cuenta (privado) |
| Ubicación → Ubicación precisa y aproximada | **Opcional**. Funcionalidad de la app (solo cuando el usuario toca "Usar mi ubicación" o "Cerca de mí") |
| Fotos y videos → Fotos | Funcionalidad de la app (evidencias) |
| Mensajes → Otros mensajes en la app | Funcionalidad de la app (chat solicitante–colaborador) |
| Contenido de la app → Otro contenido generado por el usuario | Funcionalidad de la app, seguridad y moderación (solicitudes, respuestas, reportes) |

No hay publicidad, analítica, identificadores de dispositivo ni datos financieros.

## Permisos declarados

| Permiso | Justificación |
|---|---|
| `INTERNET` | Conexión con el servidor de MtiGo! |
| `CAMERA` | Tomar fotos de evidencia en el momento, dentro de la app. No se permite usar fotos de la galería, para que la información sea actual. |
| `ACCESS_COARSE_LOCATION` / `ACCESS_FINE_LOCATION` | Solo en primer plano, cuando el usuario toca "Usar mi ubicación" (agregar el lugar a una solicitud) o "Cerca de mí" (ver solicitudes cercanas). Nunca en segundo plano. |

La cámara solo se usa mientras la persona está tomando una foto de evidencia. No se piden permisos de almacenamiento ni de galería.

## Clasificación de contenido (cuestionario IARC)
- Categoría: Utilidades/Productividad/Comunicación/Otra.
- Interacción entre usuarios: **Sí** (los usuarios intercambian texto y fotos).
- Comparte ubicación con otros usuarios: **Sí, de forma opcional** (la ubicación del lugar consultado en una solicitud).
- Compras digitales: No. Violencia, sexo, drogas, apuestas: No.

## Contenido generado por usuarios (política UGC)
Cumplido en la app: aceptación de términos que prohíben contenido inapropiado al registrarse; botón **Reportar** en cada solicitud/evidencia; **Bloquear usuario**; ocultamiento automático tras 3 reportes distintos; moderación manual desde el panel de Supabase (tabla `reports`).

## Público objetivo
18 años o más. No dirigida a niños.

## Acceso para revisores
La app requiere cuenta. En **Contenido de la app → Acceso a la app**, entrega una cuenta de prueba **creada en tu Supabase de producción** (no incluida en el código):
```
Usuario: revisor.mtigo@<tu-dominio>   Contraseña: <la que definas>
Instrucciones: Ingresar → "Explorar" muestra solicitudes reales de Villarrica.
"＋ Pedir" crea una solicitud. Los pagos no están habilitados (recompensa referencial).
```

## Declaraciones adicionales
- **Anuncios:** No contiene anuncios.
- **App financiera:** No (no hay pagos).
- **App de salud:** No.
- **Política de ubicación (julio 2026):** la ubicación se usa solo en primer plano con acción explícita; está explicado en la app y en la política de privacidad.
