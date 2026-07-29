# MtiGo — Info en tiempo real

## Descripción
Desarrolla una aplicación móvil llamada MtiGo, diseñada como una plataforma de solicitudes geolocalizadas en tiempo real. Conecta a personas que necesitan información inmediata de un lugar con usuarios que están físicamente allí, mediante micropagos. La aplicación es simple, rápida, escalable y de bajo costo operativo.

## Flujo principal
- El usuario abre la app y ve un mapa limpio (estética tipo videojuego, tonos verdes claros).
- Crea una solicitud indicando ubicación, pregunta, tipo de respuesta (Foto, Audio, Texto o Emoji), monto a pagar y TTL (2–15 minutos).
- Usuarios cercanos reciben la notificación y pueden responder.
- Al aceptar una respuesta, el pago se libera automáticamente y ambos se califican.

## Arquitectura y tecnologías
- Frontend: Flutter (iOS/Android).
- Backend: Firebase (Authentication, Firestore, Cloud Functions, Cloud Storage, Cloud Messaging, Analytics).
- Billetera digital integrada: saldo interno, historial, carga, retiros y comisiones configurables. PSP (Webpay, Mercado Pago, Stripe, etc.) integrable sin cambiar la lógica de negocio.

## Modelo de datos (colecciones)
- Usuarios, Solicitudes, Respuestas, Wallet, Transacciones, Calificaciones, Notificaciones, Configuración.

## Características clave
- Geolocalización y búsqueda por distancia.
- Notificaciones push y sistema de reputación.
- Prevención de fraude, moderación y registro de auditoría.
- Escalabilidad: arquitectura modular y desacoplada, preparada para millones de usuarios.
- Accesibilidad: interfaz minimalista, botones grandes, navegación sencilla y compatibilidad con lectores de pantalla (pensada para adultos mayores y personas con discapacidad visual).

## Panel administrativo
- Panel web para gestionar usuarios, solicitudes, pagos, reportes, métricas y moderación.

## MVP prioritario
- Registro, mapa, creación de solicitudes, respuesta con foto, billetera digital, reputación, notificaciones y panel administrativo.
- Inicio en una ciudad (Villarrica, Chile) con preparación para escalar nacional e internacionalmente sin rediseñar la arquitectura.

## Objetivo
Convertir MtiGo en la plataforma líder de información geolocalizada colaborativa, donde las personas obtienen información confiable en tiempo real y los colaboradores son recompensados.
