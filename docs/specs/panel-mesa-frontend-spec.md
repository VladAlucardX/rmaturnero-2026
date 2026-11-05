# Panel de Ventanilla — Especificación Completa de Frontend
> **Turnero de Matrículas 2026 · v2.1** — Operador / `panel_mesa.html`  
> Archivos: [`panel_mesa.html`](file:///c:/Users/windows%2010%20pro/Downloads/Turnero/src/public/panel_mesa.html) · [`panel_mesa.js`](file:///c:/Users/windows%2010%20pro/Downloads/Turnero/src/public/js/pages/panel_mesa.js) · [`turnos/routes.js`](file:///c:/Users/windows%2010%20pro/Downloads/Turnero/src/modules/turnos/routes.js)

---

## 1. Mapa Visual de la Pantalla

```
┌─────────────────────────────────────────── HEADER h-14 (sticky) ───┐
│  [MESA 3]  María González · Ventanilla 3   ● En línea  │  09:15:33  │
│                                             (WS pill)  │  30 Oct    │
│                                        [Panel Admin] [Pausar] [✕]   │
└────────────────────────────────────────────────────────────────────┘
┌──────────────── MAIN ──────────────────────────────────────────────┐
│                                                                     │
│  ┌── COLUMNA HERO (~65%) ────────┐ ┌── LATERAL (~35%) ───────────┐ │
│  │ [pill estado] [cronómetro]    │ │  PRÓXIMO TURNO DISPONIBLE   │ │
│  │                               │ │  ┌────────────────────────┐ │ │
│  │         0 4 7                 │ │  │  TURNO SIGUIENTE        │ │ │
│  │   (JetBrains Mono, 136px)     │ │  │       048               │ │ │
│  │                               │ │  │  Lote 2 · 153 vouchers  │ │ │
│  │   ✓ Atendidos hoy: 23         │ │  └────────────────────────┘ │ │
│  │                               │ │                              │ │
│  │  [LLAMAR SIGUIENTE]  Esp/Enter│ │  ┌────── callout ──────────┐ │ │
│  │  [No se presentó N] [Rellamar]│ │  │ 📡 LLAMADO EMITIDO      │ │ │
│  │  [Rezagado         0]         │ │  │  Turno 047 · Mesa 3     │ │ │
│  └───────────────────────────────┘ │  └────────────────────────┘ │ │
│                                    └─────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
┌────────────── FOOTER ──────────────────────────────────────────────┐
│  Atajos: [Espacio/Enter] Llamar · [R] Re-llamar · [N/Esc] Ausente │
│  [P] Pausar                          ● Sincronizado con nodo       │
└────────────────────────────────────────────────────────────────────┘
```

---

## 2. Inicialización de la Pantalla (`init()`)

Al abrir `panel_mesa.html` se ejecuta la siguiente secuencia:

```
1. Leer usuario de sessionStorage
   └─ Sin sesión → clearSession(redirect=true) → /index.html

2. Determinar mesa asignada
   ├─ Leer turnero_mesa de sessionStorage
   └─ GET /auth/me para validar contra servidor
       ├─ Mesa activa en servidor ≠ local → sincroniza (muestra toast "Mesa sincronizada")
       ├─ Mesa inactiva → limpiar SS → /index.html
       └─ Sin mesa asignada → /index.html

3. _initClock() — reloj en vivo cada 1 segundo
4. _initKeyboardShortcuts() — atajo Espacio/Enter/R/N/Esc/P
5. cargarEstado() — GET /turnos/estado?mesa_id=X (1 query consolidada)
   └─ Restaura: turnoActual, cronómetro, proximoNumero, atendidosHoy,
                vouchersRestantes, loteActivo, modo, mesaPausada
6. initWebSocket() — canal mesa:<id> con ticket efímero
7. initFondoPersonalizado()
```

---

## 3. Sistema de Estados Visuales (`feedbackEstado`)

Todo el color, los iconos y el texto de la pantalla responden a un único campo `feedbackEstado`:

| `feedbackEstado` | Qué ve el operador | Cuándo ocurre |
|---|---|---|
| `idle` + `turnoActual` | Ring verde esmeralda · pill "TURNO ACTUAL • EN ATENCIÓN" · punto pulsante | Turno en atención, sin acción reciente |
| `idle` + sin turno | Ring gris · "VENTANILLA LIBRE" · número `---` gris | Sin turno activo |
| `llamando` | Ring azul pulsante · pill "LLAMANDO ALUMNO..." · icono megáfono bounce · banner verde | Justo después de "Llamar Siguiente" (5 seg) |
| `rellamando` | Ring ámbar pulsante · pill "RE-LLAMANDO (2º AVISO)" · icono campana bounce · banner ámbar | Justo después de "Re-llamar a TV" (5 seg) |
| `ausente` | Ring gris · "TURNO NO PRESENTADO REGISTRADO" · banner rosa · número `---` | Justo después de "No se presentó" (5 seg) |

El `feedbackTimer` resetea el estado a `idle` automáticamente a los **5 segundos**. Si se ejecuta otra acción antes, el timer anterior se cancela y el nuevo comienza su propia cuenta de 5 seg.

---

## 4. Columna Lateral — Información en tiempo real

### Tarjeta "Próximo Turno Disponible"

Muestra el número del **siguiente voucher del lote** que se asignará al presionar "Llamar Siguiente". Se actualiza en tiempo real por WS sin necesidad de acción del operador.

| Situación | Qué muestra |
|---|---|
| Hay vouchers disponibles | Número en JetBrains Mono grande (ej: `048`) |
| Lote agotado (voucher_fisico) | `"Lote agotado"` en rojo |
| Modo kiosko, sin espera | `"Sin espera"` en gris |
| Sin lote activo | `"---"` |

Debajo del número: `"Lote 2 · 153 vouchers restantes"` (o "5 en espera" si es kiosko_web).

### Callout inferior de estado

Refleja el último evento. Sus colores cambian junto con `feedbackEstado`:
- Verde: llamado exitoso o en atención
- Ámbar: re-llamado
- Rosa: ausente
- Gris: ventanilla libre

---

## 5. Botones — Comportamiento Detallado

### 5.1 Botón "LLAMAR SIGUIENTE" `[Espacio / Enter]`

**Condiciones de bloqueo** (el botón queda `disabled` + `opacity-50`):
- `!wsConnected` (sin WS)
- `loadingAction` (hay una petición HTTP en curso)
- `mesaPausada` (overlay de pausa activo)
- `_cooldown` (1.5 seg de espera post-acción)

**Flujo al pulsarlo:**
```
1. Guards: loadingAction / mesaPausada / _cooldown → salir silenciosamente
2. !wsConnected → toast warning "Sin conexión" → salir
3. Modo kiosko + sin espera → toast info "No hay estudiantes" → salir
4. loadingAction = true
5. Generar Idempotency-Key (UUID, reutilizable hasta éxito)
6. POST /turnos/llamar { mesa_id } con header Idempotency-Key
7. Éxito:
   ├─ turnoActual = respuesta.turno
   ├─ proximoNumero actualizado
   ├─ Si NO idempotente: atendidosHoy++, iniciarCronometro(), triggerCallNext() (5s)
   └─ Si idempotente: toast info "Turno #X ya activo" (sin incrementar contador)
8. Error:
   ├─ 429/503 → cooldown extendido según Retry-After del servidor
   ├─ 409/lote agotado → toast warning "ALERTA: Lote agotado"
   ├─ error transitorio → toast danger, conservar _llamarKey para reintento idempotente
9. finally: loadingAction=false, _cooldown=true 1.5s, limpiar _llamarKey si fue éxito
```

**Atajos de teclado:**
- `Espacio` o `Enter` disparan `llamarSiguiente()` en `keydown`
- Si la tecla está **mantenida** (`e.repeat === true`), se absorbe el evento sin llamar
- En `keyup` de Espacio/Enter también se absorbe para evitar clicks residuales en botones enfocados

---

### 5.2 Botón "No se presentó" `[N / Esc]`

Solo visible cuando `turnoActual !== null` (fila de 3 botones aparece).

**Condiciones de bloqueo:** `!wsConnected`, `loadingAction`, `_cooldown`

**Flujo:**
```
1. Guards → salir
2. !wsConnected → toast warning
3. loadingAction = true
4. Capturar turnoId y turnoNum antes de limpiar
5. POST /turnos/:id/cancelar { mesa_id }
6. Éxito:
   ├─ turnoActual = null (inmediatamente)
   ├─ detenerCronometro()
   └─ triggerAbsent() (estado "ausente" 5 seg, banner rosa)
   └─ El WS emite "rezagados_actualizados" → cargarRezagados() automático
7. Error 404/409 (turno ya no en atención):
   ├─ turnoActual = null (aun así)
   ├─ detenerCronometro()
   └─ toast info "ya no estaba en atención — puede que ya lo hayas cancelado antes"
8. Error otro → toast danger
9. finally: loadingAction=false, _cooldown=true 500ms
```

> [!NOTE]
> Cooldown de solo **500ms** (vs 1.5s del llamar) porque no quema un número del lote; es una acción menos crítica.

---

### 5.3 Botón "Re-llamar a TV" `[R]`

Solo visible cuando `turnoActual !== null`.

**Condiciones de bloqueo:** `!wsConnected`, `loadingAction`, `_cooldown`

**Guardia de tiempo mínimo entre re-llamados:**
- El frontend verifica que hayan pasado al menos **10 segundos** desde el último llamado (`llamado_en` o `_ultimoRellamadoTs`)
- Si no han pasado, toast warning con los segundos restantes → **no envía la petición**

**Flujo:**
```
1. Guards → salir
2. !wsConnected → toast warning
3. Verificar 10s mínimos → si no cumple, toast "espera Xs" → salir
4. loadingAction = true
5. POST /turnos/:id/rellamar { mesa_id }
6. Éxito:
   ├─ _ultimoRellamadoTs = Date.now()
   ├─ triggerRecall() (estado "rellamando" 5 seg, banner ámbar, campana bounce)
   └─ toast info "Turno #X re-llamado en pantalla TV"
7. Error 404/409 (no hay turno en atención):
   ├─ turnoActual = null
   ├─ detenerCronometro()
   └─ cargarEstado() para sincronizar
8. Error otro → toast danger
9. finally: loadingAction=false, _cooldown=true 500ms
```

**En el servidor:** cooldown adicional de **3 segundos por mesa** en Redis. Si la petición llega antes de los 3s, responde HTTP 429. El frontend lo recibe y muestra un toast danger.

---

### 5.4 Botón "Rezagado" (con badge de conteo)

Visible tanto con turno activo como sin él. El badge muestra `totalRezagados` (número de turnos cancelados/ausentes del día disponibles para re-atender).

**Flujo sin turno activo:**
```
1. Guards (wsConnected, mesaPausada, cooldown)
2. cargarRezagados() para refrescar lista
3. totalRezagados === 0 → toast info "No hay rezagados" → salir
4. totalRezagados > 0 → abrirModalSeleccionRezagados() → modalRezagados = true
```

**Flujo con turno activo:**
```
1. Mismos guards
2. cargarRezagados()
3. totalRezagados === 0 → toast info
4. turnoActual !== null → modalConfirmarRezagadoConTurno = true
   ("¿Ya atendiste al estudiante actual?")
   ├─ Cancelar → cerrar modal, seguir atendiendo
   └─ Sí, ya atendí → abrirModalSeleccionRezagados()
      (El turno actual se marcará como "atendido" al llamar al rezagado)
```

**Modal de selección de rezagados:**
- Lista scrollable (`max-h-60`) con número, mesa de origen, tiempo transcurrido y origen (voucher/kiosko)
- Si hay más de 4, aparece un buscador por número de turno
- Al seleccionar y confirmar → `POST /turnos/atender-rezagado { turno_id, mesa_id }` con Idempotency-Key
- Éxito: turnoActual actualizado, cronómetro iniciado, triggerCallNext(), modal cerrado
- Error 409 (ya atendido por otra mesa): mensaje de error en el modal + refresca lista + deselecciona

---

### 5.5 Botón Pausar / Reanudar `[P]`

Está en el header. El icono cambia (dos barras → triángulo de play) y el botón cambia a verde cuando la mesa está pausada.

**Pausar:**
```
POST /mesas/:id/estado { estado: 'pausada' }
→ mesaPausada = true → aparece overlay de cortesía que tapa toda la pantalla
→ Operador ve: "Mesa en Pausa" + selector de motivo + botón "Reanudar"
→ Botón "LLAMAR SIGUIENTE" queda detrás del overlay (disabled también por mesaPausada)
```

**Reanudar** (desde el overlay o desde el header):
```
POST /mesas/:id/estado { estado: 'activa' }
→ mesaPausada = false → desaparece el overlay
```

> [!WARNING]
> Si el operador pausa la mesa con un turno en atención, el turno **sigue activo y el cronómetro sigue corriendo**. La pausa solo bloquea llamar nuevos turnos; no cancela el actual.

---

### 5.6 Botón Cerrar Sesión `[✕]`

**Si no hay turno activo:**
```
_ejecutarLogout()
  → ws.disconnect()
  → api.logout(true) → POST /auth/logout → /index.html
```

**Si hay turno activo:**
```
→ modalSalida = true
   Muestra: "Turno #047 está en atención. Antes de salir, indique el resultado:"
   ├─ [Fue atendido] → POST /turnos/:id/finalizar → logout
   ├─ [No se presentó] → POST /turnos/:id/cancelar → logout
   └─ [Cancelar — Seguir atendiendo] → cierra modal, regresa a la consola
```

> [!IMPORTANT]
> Al hacer logout, la mesa **NO se libera** (`operador_id` se conserva en BD). La mesa pasa a estado `pausada`. El operador puede reconectarse y retomar su mesa. Si el admin quiere liberar la mesa, debe hacerlo desde el panel de administración.

---

### 5.7 Enlace "Panel Admin" (solo si rol === 'admin')

Aparece en el header. Es un `<a href="/admin.html">` directo. No verifica turno activo.

> [!CAUTION]
> Si un admin-operador hace clic en "Panel Admin" con un turno en atención, **el turno queda huérfano en estado `en_atencion`**. No hay modal de confirmación para esta ruta. El turno permanecerá en atención hasta que el operador vuelva o el admin lo cancele desde el panel.

---

## 6. El Cronómetro — Comportamiento Exacto

```javascript
iniciarCronometro(llamadoEn)
  → detiene el timer previo si existe
  → calcula segundos = floor((Date.now() - new Date(llamadoEn)) / 1000)
  → muestra mm:ss con formatTimer()
  → corre setInterval cada 1 segundo
  → Si segundos >= 1800 (30 min): turnoActual = null, detiene cronómetro
```

- **Sincronizado contra el servidor:** usa `llamado_en` de la BD, no el reloj del cliente cuando presionó el botón. Aunque el operador recargue la página o el WS se desconecte y reconecte, el cronómetro retoma desde la marca temporal real.
- **Reset automático a los 30 minutos:** si un turno lleva más de 30 min en atención, la pantalla lo descarta automáticamente (asume que se perdió el registro de cierre).

---

## 7. Cómo se Actualiza la Pantalla Cuando Otros Operadores Llaman Turnos

La columna lateral "Próximo Turno Disponible" se actualiza en **tiempo real por WebSocket** cada vez que cualquier mesa del sistema llama un turno.

### Evento `proximo_actualizado` (canal `mesa:<id>` y `lote:activo`)

Cuando **Mesa 1** llama el turno #047:
- El servidor hace broadcast a `lote:activo` con `{ proximo_numero: 48, vouchers_restantes: 152 }`
- Todos los paneles suscritos (Mesa 2, Mesa 3…) reciben el evento
- `panel_mesa.js` actualiza `proximoNumero = 48` y `vouchersRestantes = 152` al instante
- El operador de Mesa 2 ve que el siguiente número cambió de 047 a 048 **sin hacer nada**

### ¿Cambia el turno activo de mi mesa?

**No.** El evento `proximo_actualizado` solo actualiza el lateral. El turno gigante en la columna hero (`turnoActual`) pertenece exclusivamente a esta mesa y solo cambia cuando este operador pulsa sus propios botones o el admin actúa sobre esta mesa.

### Eventos WS que SÍ pueden cambiar el estado de la pantalla actual

| Evento (canal mesa:<id>) | Qué hace |
|---|---|
| `turno_llamado` | Actualiza turnoActual si el id es distinto al actual (idempotente) |
| `proximo_actualizado` | Actualiza el número lateral y vouchers restantes |
| `rezagados_actualizados` | Llama a `cargarRezagados()` y puede deseleccionar un rezagado en el modal |
| `mesa_pausada` | Activa el overlay de pausa |
| `mesa_activada` / `mesa_activa` | Desactiva el overlay de pausa |
| `mesa_inactivada` | Muestra overlay rojo de inactivación + redirect en 2s |
| `mesa_actualizada` | Actualiza nombre/número de la mesa en el header |
| `lote_pausado` | proximoNumero=null, vouchersRestantes=0, toast warning |
| `lote_cerrado` | Igual que pausado, loteActivo=null |
| `lote_activado` | Carga el nuevo lote y actualiza próximo |
| `lote_extendido` | Actualiza vouchers y próximo con nuevos valores |
| `lote_contador_ajustado` | Sincroniza progreso del lote si el admin corrige el contador |
| `config_actualizada` | Si cambia modo_generacion_turnos → `cargarEstado()` completo |
| `snapshot` | Resincronización total tras reconexión (turno, cronómetro, lote, rezagados) |
| `sesion_duplicada` | Cierra la consola y redirige al login |
| `auth_error(4401)` | Sesión inválida → clearSession → login |
| `auth_error(4409)` | Sesión duplicada → _cerrarPorSesionDuplicada() |
| `usuario_actualizado` | Actualiza nombre del operador en el header si es el usuario actual |

---

## 8. Catálogo de Escenarios Límite

### 8.1 Doble Clic en "Llamar Siguiente"

**Escenario A — El clic llega dos veces al servidor:**
- El primer request genera un turno y responde HTTP 200.
- El segundo request llega con el **mismo Idempotency-Key** → el servidor sirve el resultado desde caché en memoria (60s de TTL) o espera el request en vuelo (coalescing) → responde `{ es_idempotente: true }`.
- El frontend detecta `es_idempotente: true` → NO incrementa `atendidosHoy`, NO lanza animación, muestra toast info: **"Turno #X ya activo en Mesa Y"**.

**Escenario B — El clic es tan rápido que `_cooldown` ya está activo:**
- `_cooldown = true` durante 1.5 segundos tras cualquier intento.
- El segundo clic entra al guard `if (this._cooldown) return` antes de llegar al servidor.
- El botón muestra texto `"Procesando..."` y está deshabilitado.

---

### 8.2 Llamar y luego Re-llamar de inmediato

- Tras "Llamar Siguiente", `_cooldown = true` por 1.5s.
- Durante ese tiempo, el botón "Re-llamar" también queda bloqueado por `_cooldown`.
- Al cumplirse el cooldown, el operador puede presionar "Re-llamar".
- El frontend verifica que hayan pasado al menos **10 segundos** desde `llamado_en` (timestamp de BD).
- Si el operador intenta re-llamar a los 2 segundos, recibe toast: **"El turno #X fue anunciado recientemente. Espera 8s antes de re-llamar."**
- Si aun así la petición llega al servidor antes de los 3s del cooldown de servidor, recibe HTTP 429 y el frontend muestra un toast danger.

---

### 8.3 Llamar, el turno no aparece en pantalla, y el operador sigue presionando

**Situación:** El operador presiona "Llamar Siguiente", ve el spinner brevemente, pero el turno no aparece (el número gigante sigue siendo `---`). Puede deberse a:

1. **La respuesta HTTP llegó pero el WS no confirmó:** El turno sí fue creado en BD. Al volver a presionar:
   - Mismo Idempotency-Key → servidor devuelve `es_idempotente: true` → frontend muestra el turno sin crear duplicado.

2. **La respuesta HTTP nunca llegó (timeout de red):** `_llamarKey` se conserva (no se limpió porque no hubo éxito). Al reintentar:
   - Mismo Idempotency-Key → si el servidor ya procesó el original: desde caché → idempotente.
   - Si el servidor nunca lo recibió: nueva transacción con la misma key → nuevo turno (pero único, sin duplicado).

3. **El WS estaba desconectado al llegar el turno:** El evento `turno_llamado` se perdió. Al reconectar, `solicitarSnapshot()` → el servidor envía el estado actual → `panel_mesa.js` restaura `turnoActual`.

4. **La petición devolvió un error (ej. 500):** El botón se rehabilita con toast danger. `_llamarKey` se conserva. El operador puede reintentar.

> [!IMPORTANT]
> **Nunca presionar "Cancelar" o "Re-llamar" si el turno aún no aparece en pantalla.** Si el turno fue creado pero el frontend aún no lo refleja, "No se presentó" cancelaría un turno que el estudiante puede estar buscando. Esperar a que el WS o el snapshot confirmen el estado real.

---

### 8.4 Presionar "No se presentó" cuando el turno ya fue cancelado antes

- El backend hace `UPDATE turnos SET estado='cancelado' WHERE id=$1 AND estado='en_atencion'`.
- Si la fila ya no estaba en `en_atencion` (fue cancelada por otra acción), el UPDATE afecta 0 filas → HTTP 404/409.
- El frontend detecta el error y:
  - `turnoActual = null` (igual)
  - `detenerCronometro()`
  - Toast info: **"El turno #X ya no estaba en atención — puede que ya lo hayas cancelado antes."**
  - La pantalla queda en `feedbackEstado = 'idle'` sin turno, lista para el siguiente.

---

### 8.5 Presionar "Re-llamar" cuando el turno ya no existe en atención en el servidor

- El servidor consulta `WHERE mesa_id=$1 AND estado='en_atencion'`.
- Si no encuentra turno (fue cancelado, atendido, o la mesa fue cambiada): HTTP 409 `"No hay turno en atención en esta mesa para re-llamar"`.
- El frontend detecta 404/409 o el mensaje específico:
  - `turnoActual = null`
  - `detenerCronometro()`
  - `cargarEstado()` para resincronizar todo
  - Toast danger con el mensaje del error.

---

### 8.6 El Lote se Agota mientras el Operador está Llamando

**A) El lote se agota con el clic actual:**
- `POST /turnos/llamar` devuelve HTTP 409 con `"lote agotado"` o el servidor genera el turno y notifica `lote_agotado` a admin.
- Frontend: toast warning **"ALERTA: El lote de vouchers se ha agotado. Notifique al supervisor."**
- `proximoNumero = null`, `vouchersRestantes = 0`.
- El botón "Llamar Siguiente" queda habilitado pero al presionar vuelve a dar el mismo error.

**B) El lote se agota mientras el operador está atendiendo un turno:**
- WS emite `lote_agotado` → panel admin recibe la alerta.
- El panel del operador recibe `proximo_actualizado` con `proximo_numero: null, vouchers_restantes: 0`.
- La columna lateral muestra `"Lote agotado"` en rojo.
- El operador puede terminar el turno actual con normalidad. Solo el próximo llamado fallará.

**C) El admin extiende el lote:**
- WS emite `lote_extendido` → el panel actualiza `vouchersRestantes` y `proximoNumero` al instante.
- El operador ve que la columna lateral vuelve a mostrar un número. Puede volver a llamar.

---

### 8.7 El Admin Pausa o Inactiva la Mesa del Operador

**Pausa remota por admin:**
- WS emite `mesa_pausada` → `mesaPausada = true` → el overlay de cortesía aparece.
- El overlay **tapa toda la pantalla** excepto el header.
- El operador ve el motivo de pausa seleccionado y el botón "Reanudar".
- El admin puede luego reanudar → WS emite `mesa_activada` → overlay desaparece.

**Inactivación remota por admin:**
- WS emite `mesa_inactivada` → `mesaInactivada = true`.
- Aparece un **overlay rojo permanente** con el mensaje correspondiente:
  - "Ventanilla inactivada por la administración."
  - "La administración reasignó esta ventanilla a otro operador."
  - "Esta ventanilla fue retirada por la administración."
- Limpia `sessionStorage` de mesa.
- Toast warning con el motivo.
- Redirige a `/index.html` en **2 segundos** (el operador ve el aviso antes de ser enviado).
- El operador llega al login y ve la grilla de mesas para tomar otra disponible.

---

### 8.8 Sesión Duplicada — Otro Operador / Pestaña Abre la Misma Mesa

Si el mismo usuario abre `panel_mesa.html` en otra pestaña o dispositivo:
1. El WS del nuevo cliente se autentica con el mismo JWT → el servidor detecta la duplicidad.
2. Cierra el WS antiguo con código `4409`.
3. `ws-client.js` emite evento `sesion_duplicada` → `_cerrarPorSesionDuplicada()`.
4. Limpia sessionStorage de mesa.
5. Toast warning: **"Esta ventanilla fue abierta en otra ventana o dispositivo."**
6. Redirige a `/index.html?sesion_cerrada=1` en 1.5 segundos.

---

### 8.9 Corte de Red / Desconexión del WS

**Al detectar el cierre del WS (`onclose`):**
- `wsConnected = false` → el pill del header cambia a ámbar `"Reconectando"`.
- Los botones de acción quedan bloqueados (`!wsConnected`).
- `ws-client.js` programa reconexión con backoff exponencial + full jitter.

**¿Qué ve el operador durante la desconexión?**
- El turno actual **sigue visible** con el número gigante (el estado no se borra).
- El cronómetro **sigue corriendo** (es un `setInterval` local, independiente del WS).
- Los botones están deshabilitados con `opacity-50`.
- Si el operador intenta presionar un botón, recibe toast warning "Sin conexión con el servidor".

**Al reconectar:**
- `wsConnected = true` → pill vuelve a verde pulsante.
- El WS solicita `snapshot` automáticamente (RF-WS-05).
- El servidor responde con el estado completo: turno actual, cronómetro, próximo, lote, rezagados.
- Si durante la desconexión otro operador llamó turnos, el `proximoNumero` se actualiza.

**Recuperación de red física (`window.online` event):**
- Reconexión inmediata con `reconnectAttempts = 0`.

**Pestaña en segundo plano:**
- Al volver, `visibilitychange` → si el WS está abierto, solicita snapshot; si está cerrado, reconecta.

---

### 8.10 Turno que Supera los 30 Minutos

- El `setInterval` del cronómetro verifica `segundos >= 1800` en cada tick.
- Si se cumple:
  - `turnoActual = null` (la pantalla muestra `---`)
  - `detenerCronometro()` → `cronometro = "00:00"`
  - **No hay notificación al servidor** (el turno sigue en `en_atencion` en BD).
  - El operador debe llamar manualmente o cancelar.
  
> [!NOTE]
> Esta es una medida de seguridad visual para evitar que la pantalla quede mostrando un número durante horas si el operador olvidó cerrar el turno. La BD mantiene el turno real en `en_atencion`.

---

### 8.11 Atajos de Teclado — Casos Límite

| Situación | Qué pasa |
|---|---|
| Operador está escribiendo en el buscador de rezagados | El handler verifica `e.target.tagName === 'INPUT'` → ignora el teclazo |
| Tecla mantenida pulsada (key repeat) | `e.repeat === true` → absorbido, **sin llamados repetitivos** |
| Espacio/Enter con botón enfocado en el DOM | `document.activeElement.blur()` antes de llamar → evita doble acción (atajo + click nativo del navegador) |
| Tecla N/Esc con modal de salida abierto | El modal de salida es un `<div>` propio; si el operador presiona Esc mientras el modal está visible, el handler lo pasa a `cancelarTurno()` pero `turnoActual` ya podría ser null → guarda silenciosa |
| Tecla P con mesa ya pausada | `mesaPausada ? reanudarMesa() : pausarMesa()` — P siempre alterna |

---

### 8.12 Rezagados — Escenarios Multi-Mesa

**Escenario: Dos operadores ven el mismo rezagado en el modal al mismo tiempo**

1. Operador A y Operador B ven el turno #023 (cancelado) en el modal.
2. Operador A presiona "Confirmar y atender" primero.
   - `_rezagadosEnVuelo.add(turnoId)` (lock optimista local).
   - `POST /turnos/atender-rezagado { turno_id: 23, mesa_id: 1 }`.
   - El servidor hace `UPDATE turnos SET estado='en_atencion' WHERE id=23 AND estado='cancelado'` → éxito.
   - Broadcast `rezagados_actualizados { accion: 'atendido', turno_id: 23 }`.
3. Operador B recibe el WS antes de confirmar:
   - `cargarRezagados()` → el turno 23 ya no aparece en la lista.
   - Si Operador B ya había seleccionado el turno 23: `rezagadoSeleccionado = null`, error en modal: **"El turno #023 acaba de ser atendido por Mesa 1."**
4. Si Operador B confirma simultáneamente al servidor (race condition HTTP):
   - El servidor devuelve HTTP 409 `turno_no_disponible`.
   - Frontend: error en modal "El turno ya fue atendido por otra ventanilla." + refresca lista + deselecciona.

---

### 8.13 Cambio de Día a Medianoche

El `_initClock()` verifica `now.toDateString() !== this._fechaHoy` en cada tick del segundo.

Al cruzar la medianoche:
- `_fechaHoy = fechaActual`
- `listaRezagados = []`
- `totalRezagados = 0`
- `rezagadoSeleccionado = null`
- Si el modal de rezagados está abierto: se cierra.
- `cargarRezagados(true)` con la nueva fecha (la BD filtra por `fn_fecha_hoy()`).

El turno activo y el lote **no se resetean automáticamente**. Si el operador tiene un turno en atención a medianoche, sigue activo. El admin debe gestionar el cierre del lote del día anterior.

---

### 8.14 Admin Edita el Nombre/Número de la Mesa en Vivo

- WS emite `mesa_actualizada { mesa: { id, numero, nombre } }`.
- `panel_mesa.js` verifica que `m.id === mesa.id` (ignora eventos de otras mesas).
- Actualiza `mesa.numero` y `mesa.nombre` → el header se actualiza instantáneamente.
- Sincroniza el sessionStorage para que las futuras recargas tengan el dato correcto.

---

### 8.15 Admin Cambia el Modo (voucher_fisico ↔ kiosko_web)

- WS emite `config_actualizada { clave: 'modo_generacion_turnos', valor: 'kiosko_web' }`.
- `panel_mesa.js` llama a `cargarEstado()` completo para resincronizar lote, próximo y modo.
- La columna lateral y los textos del botón "Llamar" se adaptan al nuevo modo sin recargar la página.

---

## 9. Cleanup — Timers y Listeners (`destroy()`)

Alpine llama a `destroy()` al desmontar el componente. Se limpian:

| Recurso | Cómo |
|---|---|
| `relojTimer` | `clearInterval()` |
| `cronometroTimer` | `clearInterval()` |
| `feedbackTimer` | `clearTimeout()` |
| `_boundKeyDown` | `removeEventListener('keydown', ...)` |
| `_boundKeyUp` | `removeEventListener('keyup', ...)` |
| `ws` | `ws.disconnect()` → cancela heartbeat, timers de reconexión, cierra socket |

---

## 10. Resumen de Endpoints Involucrados

| Acción | Endpoint | Método | Idempotente |
|---|---|---|---|
| Cargar estado inicial | `/turnos/estado?mesa_id=X` | GET | — |
| Llamar siguiente | `/turnos/llamar` | POST | Sí (Idempotency-Key, 60s caché) |
| No se presentó | `/turnos/:id/cancelar` | POST | BD idempotente (UPDATE WHERE en_atencion) |
| Re-llamar a TV | `/turnos/:id/rellamar` | POST | No (cada re-llamado es un aviso nuevo) |
| Finalizar turno (salida) | `/turnos/:id/finalizar` | POST | BD idempotente |
| Atender rezagado | `/turnos/atender-rezagado` | POST | Sí (Idempotency-Key) |
| Pausar mesa | `/mesas/:id/estado` | PATCH | BD idempotente |
| Reanudar mesa | `/mesas/:id/estado` | PATCH | BD idempotente |
| Cargar rezagados | `/turnos/rezagados` | GET | — |
| Cerrar sesión | `/auth/logout` | POST | — |
| Verificar sesión | `/auth/me` | GET | — |
