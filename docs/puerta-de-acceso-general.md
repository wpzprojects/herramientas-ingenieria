# Puerta de acceso general con solicitud de acceso — PLAN (la puerta al abrir NO se implementó; ver CLAUDE.md «Niveles de acceso»)

Análisis del 2026-09-18. **Estado: solo análisis, el usuario decidió no implementarlo todavía.** Este documento reúne todo lo necesario para retomarlo en cualquier momento sin volver a analizar. Antes de implementar: releer las "Preguntas abiertas" (sección 11) y confirmar las decisiones con el usuario.

## 1. Idea original del usuario

Que al abrir la aplicación aparezca una ventana que pida autenticación con Google. Si el correo está en la lista de usuarios, entra a la app (como usuario o como administrador). Si no está, se le dice que no tiene acceso y se le ofrece **pedir permiso de ingreso**, al estilo de las apps de documentos (Google Docs): la solicitud le llega al administrador (idealmente por correo) y este la aprueba o rechaza.

## 2. Veredicto

**Viable.** Reutiliza casi todo lo que ya existe (login con Google, lista de usuarios en Firestore, roles admin/usuario, pantalla de administración). Costo: sigue en el plan gratuito de Firebase (Spark). La advertencia principal es qué protege realmente (sección 3).

## 3. Advertencia principal: qué protege y qué NO

La app es un sitio estático en GitHub Pages y **todos sus archivos son públicos** (código y `data/*.json`). Las páginas de GitHub Pages son públicas por defecto aunque el repo sea privado; solo se pueden restringir con GitHub Enterprise Cloud.

Una puerta de login en la interfaz:
- **Sí**: permite saber quién usa la app, bloquear la interfaz a quien no esté en la lista, dar permisos por rol y gestionar solicitudes.
- **NO**: no hace confidencial el contenido. Quien conozca las direcciones de los archivos puede leerlos sin iniciar sesión. Es un control de uso, no de secreto.

Para proteger contenido confidencial de verdad hay que proteger el hosting. Opción sin tocar el código: **Cloudflare Access** (login de Google delante del sitio, lista de correos permitidos, gratis hasta 50 usuarios, sin tarjeta). Exige mover el sitio a Cloudflare (p. ej. Cloudflare Pages); sería un proyecto aparte y mantendría una segunda lista de correos.

Nada confidencial puede ir en `data/*.json` ni en el repo mientras el sitio sea público (ver `CLAUDE.md`).

## 4. Flujo propuesto

Al abrir la app, antes de mostrar nada: pantalla "Verificando acceso…" (overlay que cubre el shell).

1. **Sin sesión** → pantalla "Iniciar sesión con Google" (el `signInWithPopup` debe dispararse desde un clic del usuario; no puede abrirse solo). Firebase recuerda la sesión: solo se ve la primera vez en cada dispositivo.
2. **Con sesión y en `usuarios`** → entra con su rol (admin/usuario). Se guarda el "permiso en caché" (sección 7).
3. **Con sesión y fuera de la lista** → "Tu cuenta no tiene acceso a la aplicación", con botones **Solicitar acceso** y **Usar otra cuenta**.
4. **Solicitud enviada** → "Solicitud pendiente" con botón "Comprobar de nuevo".
5. **Administrador**: en Configuración avanzada, sección **Solicitudes pendientes** con **Aprobar** (como `usuario` o `admin`) y **Rechazar**; con un indicador visible cuando haya pendientes.
6. **Rechazada** → mensaje de que la solicitud fue rechazada (no puede reenviarla).

## 5. Solicitudes de acceso

Colección nueva `solicitudes/{correo}` (un documento por correo, así una persona no puede inundar de peticiones):

```
{ nombre: string (<=100), mensaje: string (<=300, opcional), fecha: timestamp, estado: 'pendiente' | 'rechazada' }
```

Aprobar = crear `usuarios/{correo}` (`rol`, `agregadoPor`, `fecha`) y borrar la solicitud (mejor con un batch). Rechazar = poner `estado: 'rechazada'` (queda como bloqueo anti-reenvío).

**Borrador de reglas** (dentro de `match /databases/{database}/documents`; reutiliza `autenticado()`, `correo()`, `esUsuario()` y `esAdmin()` de `firebase/firestore.rules`). **Sin probar**: validar en el Simulador de reglas de la consola antes de publicar.

```
match /solicitudes/{id} {
  allow get: if autenticado() && (id == correo() || esAdmin());
  allow list: if esAdmin();
  allow create: if autenticado() && id == correo() && !esUsuario()
                && request.resource.data.keys().hasOnly(['nombre', 'mensaje', 'fecha', 'estado'])
                && request.resource.data.estado == 'pendiente'
                && request.resource.data.nombre is string && request.resource.data.nombre.size() <= 100
                && (!('mensaje' in request.resource.data)
                    || (request.resource.data.mensaje is string && request.resource.data.mensaje.size() <= 300));
  allow update: if esAdmin();
  allow delete: if esAdmin() || (id == correo() && resource.data.estado == 'pendiente');
}
```

Notas de diseño de las reglas:
- Un usuario con solicitud `rechazada` no puede volver a crearla (el documento ya existe) ni actualizarla (solo el admin actualiza).
- Un usuario ya autorizado no puede crear solicitud (`!esUsuario()`).
- Interruptor de emergencia (sección 9): un documento `ajustes/acceso` con lectura pública solo para ese documento; hay que declararlo antes del `match /ajustes/{doc}` genérico o con una regla específica, y `esAdmin()` para escribirlo.

## 6. Cómo enterarse de las solicitudes (correo)

| Opción | Costo | Cómo funciona | Comentario |
|---|---|---|---|
| **Sin correo** (recomendada para la fase 1) | Gratis | El admin ve las solicitudes al entrar a Configuración avanzada, con indicador. | Sin configuración extra; no se entera solo. |
| **EmailJS** | Gratis hasta 200 correos/mes | El navegador pide el envío directamente. | Sencillo; cualquiera podría disparar avisos a tu buzón (volumen limitado); menos seguro. |
| **Apps Script + Gmail** | Gratis | Un pequeño servicio de Google recibe la solicitud, verifica el token de quien la envía y manda el correo. | Más seguro que EmailJS; más trabajo. |
| **Funciones de Firebase** | Requiere plan Blaze (tarjeta); el uso previsto cae en la cuota gratuita (2 M invocaciones/mes) | Al crearse la solicitud se envía el correo automáticamente. | Lo más limpio; exige activar el plan de pago y un servicio de correo (SMTP/Gmail/SendGrid). |

Recomendación: empezar sin correo y añadir Apps Script o EmailJS después.

## 7. Uso sin internet (la app es PWA offline)

Comprobar la lista exige conexión. Propuesta: **permiso en caché con vigencia**.
- Tras validar en línea se guarda en `localStorage` (clave sugerida `acceso.permiso`): `{ email, rol, vence }`.
- Sin internet se deja entrar mientras no haya vencido (sugerido 14 o 30 días).
- Al reconectar se revalida: si lo quitaron de la lista, se bloquea y se limpia el permiso.
- La puerta debe poder decidir **sin cargar el SDK de Firebase** cuando hay permiso en caché válido (el SDK viene de gstatic y el service worker no cachea orígenes externos, así que offline no se puede cargar).

Límites (aceptados): no es seguridad real (localStorage editable); quitar a alguien tarda en surtir efecto hasta que se conecte; el primer uso siempre requiere internet.

## 8. Cambios técnicos previstos

Lo que ya existe y se reutiliza: `js/auth/backend.js` (contrato), `backend-firebase.js`, `backend-mock.js` (replica las reglas), `firebase/firestore.rules`, `js/views/configuracion-avanzada.js`, `tools/verify_ia.html` y `tools/preview_ia.html`.

Por agregar:
- `js/auth/puerta.js`: la pantalla/overlay con todos los estados; `js/app.js` debe **esperar el resultado de la puerta antes de `initRouter`** (y de dibujar la app).
- Contrato de backend (en `backend.js`, y en `backend-firebase.js` y `backend-mock.js`): `obtenerMiSolicitud()`, `solicitarAcceso(nombre, mensaje)`, `listarSolicitudes()`, `resolverSolicitud(email, 'aprobar' | 'rechazar', rol)`.
- Reglas nuevas de `solicitudes` (sección 5) en `firebase/firestore.rules`.
- Panel "Solicitudes pendientes" en `configuracion-avanzada.js` (solo admin) y chip de usuario/cerrar sesión en la barra superior.
- Pruebas en `tools/verify_ia.html` (mock replicando las reglas: crear propia solicitud, no crear la de otro, no reenviar rechazada, solo admin aprueba/rechaza, permiso en caché con vencimiento) y escenarios en `tools/preview_ia.html`.
- Actualizar `sw.js` (`APP_SHELL` + `CACHE_VERSION`), README y `CLAUDE.md`.

## 9. Riesgos y cosas a tener presentes

- **Todos necesitan cuenta de Google** (Gmail personal; una cuenta de Workspace corporativo puede tener apps de terceros bloqueadas).
- **Móvil / app instalada**: el `signInWithPopup` puede fallar (sobre todo iOS/Safari). El respaldo `signInWithRedirect` sufre por cookies de terceros entre `github.io` y `firebaseapp.com`. Probar en los dispositivos reales antes de activar.
- **Fallo cerrado**: si Firebase está caído, nadie nuevo entra (salvo con permiso en caché). Contemplar un **interruptor de emergencia** (`ajustes/acceso.requerirLogin`, con lectura pública solo de ese documento) para desactivar la puerta.
- **Datos personales**: correos y mensajes de solicitud (Ley 1581 de 2012, Colombia); guardar lo mínimo y poner un aviso en la pantalla de solicitud.
- **Costo**: Spark alcanza. Cada apertura hace ~1 lectura (límite 50 000 lecturas/día).
- **Rendimiento**: cargar el SDK de Firebase en cada inicio (si no hay permiso en caché).
- **Cambio de comportamiento**: hoy cualquiera usa la app libremente; con la puerta todos tendrían que pedir acceso. Activar con el interruptor y probar con calma; avisar a los usuarios actuales.

## 10. Alternativa intermedia (menos fricción)

Puerta **solo para los módulos sensibles** (Funciones de IA y Configuración avanzada), dejando calculadoras, catálogos y normatividad abiertos y 100 % offline. No rompe el uso sin internet y suele bastar si el objetivo es controlar quién usa la IA.

## 11. Preguntas abiertas (el usuario aún no las respondió)

1. **Propósito**: ¿controlar/saber quién usa la app, proteger contenido confidencial, o ambos? (si es confidencial, la puerta en pantalla no basta: ver sección 3).
2. **Alcance**: ¿toda la app o solo los módulos sensibles?
3. **Offline**: ¿permiso en caché de 14 días (recomendado), 30 días, o siempre requerir internet?
4. **Aviso de solicitudes**: ¿sin correo al inicio (recomendado), EmailJS, Apps Script + Gmail o Funciones de Firebase (Blaze)?

## 12. Fases sugeridas

1. Puerta + solicitud de acceso + permiso en caché, con interruptor de emergencia y sin correo.
2. Panel de solicitudes para el administrador (aprobar/rechazar).
3. Aviso por correo (Apps Script o EmailJS).
4. Permisos por módulo/rol y registro de accesos (quién agregó/quitó a quién).
5. Solo si el contenido es confidencial: proteger el hosting (Cloudflare Access).

## 13. Datos verificados el 2026-09-18 (pueden cambiar)

- Cloudflare Access gratis: hasta 50 usuarios, con Google y lista de correos permitidos, sin tarjeta.
- EmailJS gratis: 200 solicitudes/mes y 2 plantillas.
- GitHub Pages: público por defecto incluso con repo privado; acceso restringido solo con Enterprise Cloud.
- Cloud Functions de Firebase requieren plan Blaze; la cuota gratuita incluye 2 M invocaciones/mes.
- Firebase Spark: Authentication gratis hasta 50 000 usuarios activos/mes; Firestore 1 GiB, 50 000 lecturas/día y 20 000 escrituras/día.

Fuentes: [Cloudflare plan gratuito](https://www.cloudflare.com/plans/free/) · [EmailJS precios](https://www.emailjs.com/pricing/) · [Control de acceso en GitHub Pages](https://github.blog/changelog/2021-01-21-access-control-for-github-pages/) · [Cuotas de Cloud Functions](https://firebase.google.com/docs/functions/quotas) · [Firebase precios](https://firebase.google.com/pricing)
