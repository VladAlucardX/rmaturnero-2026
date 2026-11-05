# 📱 Especificación Técnica Frontend: Kiosko de Autoservicio y Seguimiento Móvil (`kiosko.html` / `kiosko.js`) — v2.1
> **Archivo de Vista:** [`src/public/kiosko.html`](file:///c:/Users/windows%2010%20pro/Downloads/Turnero/src/public/kiosko.html)  
> **Controlador Modular:** [`src/public/js/pages/kiosko.js`](file:///c:/Users/windows%2010%20pro/Downloads/Turnero/src/public/js/pages/kiosko.js)  
> **Servicio Backend Kiosko:** [`src/modules/kiosko/service.js`](file:///c:/Users/windows%2010%20pro/Downloads/Turnero/src/modules/kiosko/service.js)  
> **Controlador de Impresora Térmica:** [`src/public/js/escpos-printer.js`](file:///c:/Users/windows%2010%20pro/Downloads/Turnero/src/public/js/escpos-printer.js)  
> **Normativas UI/UX:** `ui-design.md` § 6.5 | `general.md` § 6 (Módulo 7 / Módulo 8) | RF-GEN-02, RF-GEN-03, RF-WS-01

---

## 1. Visión General y Propósito del Módulo

El módulo de Kiosko es una solución híbrida de autoservicio para la emisión y seguimiento de turnos digitales sin necesidad de autenticación de usuario. Opera bajo dos modalidades operativas mutuamente excluyentes o complementarias:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               MODALIDADES DE KIOSKO                                    │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│ 1. MODALIDAD ASISTIDA (TABLET EN PORTÓN)  │ 2. MODALIDAD ESTUDIANTIL (MÓVIL AUTÓNOMO) │
│ • URL: /kiosko.html?modo=tablet           │ • URL: /kiosko.html                       │
│ • Tablet o PC táctil fija en portería.    │ • Smartphone personal del estudiante.      │
│ • Operado por personal de recepción.      │ • Escaneado de QR impreso en póster.       │
│ • Sin límite de turnos por dispositivo.   │ • Límite estricto: 1 turno activo por cel. │
│ • Pantalla de voucher con auto-reset 15s. │ • Redirección directa a seguimiento vivo.  │
│ • Impresión térmica física (LAN/BT/SO).   │ • Screen WakeLock + Chime + Vibración.     │
└───────────────────────────────────────────┴────────────────────────────────────────────┘
```

---

## 2. Las Dos Modalidades de Uso

### 2.1 Modalidad Asistida (Tablet en Portón / Módulo de Recepción)
- **Detección:** La pantalla se inicializa en modo tablet si la URL contiene el parámetro explícito `?modo=tablet` (`esTablet = true`).
- **Flujo Operativo:**
  1. El personal de portería recibe al estudiante y presiona **"Asignar turno"**.
  2. El sistema genera atómicamente el número correlativo (ej. `#047`).
  3. Muestra la pantalla del voucher (`step = 'ticket'`) con el número en formato colosal (`text-7xl`), personas antes, tiempo estimado y un código QR vectorial de 190px apuntando a la URL pública de seguimiento.
  4. Si la impresión automática está habilitada, emite el ticket físico por la impresora térmica conectada (vía red LAN TCP puerto 9100, Bluetooth o diálogo del sistema).
  5. Se activa un temporizador de retorno automático de 15 segundos (`iniciarAutoReset(15)`) con cuenta regresiva visible (`iniciarCuentaRegresiva(15)`).
  6. Para agilizar filas masivas, el operador puede saltarse la cuenta regresiva pulsando directamente el botón primario **"Asignar siguiente"** (`asignarSiguiente()`), emitiendo el siguiente turno en menos de 300 ms sin regresar manualmente a la pantalla de bienvenida.
- **Sin Bloqueo por Dispositivo:** No utiliza ni restringe por `turnero_mi_turno` en `localStorage`, permitiendo emitir cientos de turnos continuos desde la misma tablet.

---

### 2.2 Modalidad Estudiantil (Autoservicio Móvil / Smartphone)
- **Detección:** Cuando se accede sin el parámetro `?modo=tablet` (ej. escaneando el QR oficial en la entrada o el QR impreso en el papel).
- **Flujo Operativo:**
  1. El estudiante pulsa **"Tomar mi turno"**.
  2. El sistema envía un identificador único de dispositivo persistente (`deviceId` generado vía `crypto.randomUUID()` en `localStorage.turnero_device_id`).
  3. Al recibir el turno, **pasa de inmediato al modo de seguimiento** (`step = 'seguimiento'`) y guarda el token en `localStorage.turnero_mi_turno`.
  4. La pantalla solicita a la API del navegador mantener la pantalla encendida (`navigator.wakeLock.request('screen')`) para evitar que el teléfono se suspenda.
  5. Muestra en vivo:
     - Tarjeta de espera en auditorio con personas antes de él.
     - Posición recalculada dinámicamente en memoria cada vez que se emite un llamado a ventanillas (0 consultas HTTP a base de datos).
  6. **Momento del Llamado:** Al ser convocado por una ventanilla (`estado = 'en_atencion'`):
     - La tarjeta se ilumina en verde esmeralda con borde pulsante (`animate-pulse-call border-emerald-500`).
     - Título colosal: **DIRÍJASE A MESA X**.
     - Emisión del sonido institucional discreto (`playCallChime()`).
     - Vibración háptica en el celular (`navigator.vibrate([300, 150, 300, 150, 600])`).
     - Cambio del título de la pestaña del navegador: `¡TU TURNO! Mesa X — Matrículas 2026`.

---

## 3. Máquina de Estados del Kiosko (`step`)

La vista se organiza en 3 pasos secuenciales controlados por la reactividad de Alpine.js:

```
          ┌──────────────────────────────────────────────┐
          │               step: 'welcome'                │
          │     (Bienvenida / Botón de Emisión)          │
          └──────────────────────┬───────────────────────┘
                                 │
           ┌─────────────────────┴─────────────────────┐
           │ ¿Es Tablet en Portón?                     │
           ▼ (Sí)                                      ▼ (No: Celular)
┌──────────────────────────────┐            ┌──────────────────────────────┐
│        step: 'ticket'        │            │     step: 'seguimiento'      │
│  (Comprobante / QR / Impr.)  │            │  (Tracking en vivo + Alertas)│
│       Auto-reset 15s         │            └──────────────────────────────┘
└──────────┬───────────────────┘                           ▲
           │                                               │
           └──────── "Seguir mi turno en vivo" ────────────┘
```

### Tabla de Estados de un Turno en Seguimiento (`seguimientoData.estado`)

| Estado | Vista en Pantalla | Acciones Permitidas |
|---|---|---|
| `'esperando'` | Tarjeta ámbar: *"En espera en auditorio"*, personas antes actualizadas en tiempo real. | Mantener pantalla abierta. Reintento automático en segundo plano. |
| `'en_atencion'` | Tarjeta esmeralda pulsante: *"¡Es tu turno! Diríjase a Mesa X"*. Audio y vibración activados. | Acercarse a la ventanilla. El botón de salida se mantiene bloqueado para no perder el turno. |
| `'atendido'` | Tarjeta gris neutra: *"Turno atendido: La atención ha concluido con éxito"*. | Botón **"Finalizar seguimiento"** que limpia `localStorage` y regresa a `welcome`. |
| `'cancelado'` | Tarjeta rosa de advertencia: *"Turno no presentado o cancelado por inasistencia"*. | Botón **"Tomar un nuevo turno"** que libera el dispositivo y regresa a `welcome`. |

---

## 4. Arquitectura de Impresión Térmica Híbrida (Modo Tablet)

Para garantizar impresión física confiable en redes locales universitarias (LAN HTTP sin certificados SSL públicos) y con distintos tipos de equipamiento, el Kiosko cuenta con un subsistema de impresión desacoplado y tolerante a fallos:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          CANALES DE EMISIÓN DE IMPRESIÓN                               │
├────────────────────┬────────────────────┬────────────────────┬─────────────────────────┤
│ 1. Red LAN (TCP)   │ 2. Bluetooth (BT)  │ 3. Controlador SO  │ 4. Sin Impresora        │
│ • Puerto TCP 9100. │ • Web Bluetooth    │ • Ventana nativa   │ • Modo 100% digital.    │
│ • Socket directo a │   GATT API.        │   print() del SO.  │ • Cero papel y cero     │
│   la IP del equipo.│ • Rollos 58/80mm.  │ • Diálogo USB.     │   avisos de error.      │
│ • 100% nativo HTTP.│ • Requiere flags.  │ • Inyección PNG.   │                         │
└────────────────────┴────────────────────┴────────────────────┴─────────────────────────┘
```

### 4.1 Especificación Detallada por Canal

#### Canal 1: Impresora en Red Local LAN (TCP / ESC-POS Nativo) — Recomendado
- **Mecanismo:** El servidor Node.js o el middleware abre un socket TCP directo mediante `net.createConnection({ host: ip, port: 9100 })` hacia la impresora térmica de red.
- **Bytes ESC-POS Manuales:**
  - Inicialización: `ESC @` (`0x1B, 0x40`).
  - Alineación centrada: `ESC a 1` (`0x1B, 0x61, 0x01`).
  - Número de turno en doble ancho y doble alto: `GS ! 0x11` (`0x1D, 0x21, 0x11`).
  - Código QR nativo ESC-POS: Modelo 2 con comandos de almacenamiento e impresión en buffer de impresora (`GS ( k 0x03 0x00 0x31 0x51 0x30`).
  - Corte de papel automático: `GS V 66 0` (`0x1D, 0x56, 0x42, 0x00`).
- **IP Personalizada por Tablet:** Cada tablet puede configurar localmente su IP (`ipTabletPersonalizada`), permitiendo que la Tablet de Portería Norte imprima en la `192.168.1.150` y la Tablet de Portería Sur imprima en la `192.168.1.151`.

#### Canal 2: Impresora Térmica Bluetooth (Web Bluetooth API)
- **Mecanismo:** La tablet se comunica directamente con la impresora Bluetooth portátil mediante GATT (servicios seriales estándar `000018f0-0000-1000-8000-00805f9b34fb`).
- **Reto de Seguridad HTTP y Solución en LAN:** En redes HTTP sin SSL, los navegadores bloquean la Web Bluetooth API. El Kiosko incluye una guía interactiva con botón de copiado de URL para habilitar el origen en:
  `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.
- Mantiene reconexión automática silenciosa (`bluetoothPrinter.reconectarSilencioso()`).

#### Canal 3: Controlador del Sistema (Driver SO / Diálogo USB)
- **Mecanismo:** Diseñado para impresoras conectadas por cable USB a la PC o tótem táctil.
- Abre una ventana emergente compacta con estilos `@page { margin: 0mm !important; size: auto; }` y `overflow: hidden`, evitando desbordes o páginas en blanco al final del ticket.
- Captura el código QR generado en el DOM y lo inyecta como una imagen Data URL PNG (`<img src="data:image/png;base64,...">`).
- Dispara `win.print()` automáticamente tras 150 ms y se cierra sola tras 400 ms.

#### Canal 4: Sin Impresora (Solo Pantalla)
- Desactiva cualquier intento de impresión física para operaciones puramente digitales o en caso de desabastecimiento de papel.

---

### 4.2 Impresión Automática vs. Manual y Resiliencia ante Fallos

- **Impresión Automática (`impresionAutomatica = true`):**
  Al pulsar "Asignar turno", el sistema dispara la impresión física de inmediato sin requerir clics adicionales.
- **Reimpresión de Copias:**
  Si el rollo se atascó o el estudiante solicita un duplicado, la tablet dispone del botón **"Imprimir voucher"** (`imprimirTicket(true)`), enviando una copia rotulada sin avanzar el contador.
- **Tolerancia Absoluta a Fallos de Hardware:**
  Si la impresora se queda sin papel, se desconecta o la IP no responde (timeout tras 3.5 segundos):
  1. **El turno NUNCA se cancela ni se pierde:** Queda registrado en base de datos y visible en la tablet.
  2. La pantalla muestra un aviso visual no bloqueante:  
     *"Aviso: No se pudo imprimir (TIMEOUT / ECONNREFUSED). El turno #047 está registrado y visible en pantalla."*
  3. El operador puede entregar el número verbalmente al estudiante o mostrarle el QR en la pantalla de la tablet para que lo escanee.

---

## 5. Control de Capacidad y Límite Diario de Turnos (`kiosko_tope_diario`)

El sistema cuenta con un control de capacidad para evitar sobrecupos en las jornadas de matrícula:

1. **Parámetro de Configuración:** `kiosko_tope_diario` (editable en caliente desde el Panel de Administración). Si es `0`, el cupo es ilimitado.
2. **Control Concurrente en Base de Datos (PostgreSQL):**
   La asignación del número se realiza en una sola transacción atómica que comprueba el tope antes de incrementar:
   ```sql
   INSERT INTO kiosko_contador_diario (fecha, ultimo_numero, sesion, actualizado_en)
   VALUES ($1, 1, 1, NOW())
   ON CONFLICT (fecha)
   DO UPDATE SET
     ultimo_numero = kiosko_contador_diario.ultimo_numero + 1,
     actualizado_en = NOW()
   WHERE kiosko_contador_diario.ultimo_numero < $2
   RETURNING ultimo_numero, sesion
   ```
3. **Comportamiento al Alcanzar el Límite:**
   - Si `ultimo_numero >= topeDiario`, el query no actualiza ninguna fila y devuelve un array vacío.
   - El backend responde inmediatamente con error **HTTP 409 Conflict** (`codigo: 'tope_diario_alcanzado'`).
   - El estado en caché del servidor invalida su TTL y marca `tope_alcanzado = true`.
4. **Comportamiento en Frontend:**
   - En el Kiosko, la propiedad reactiva `topeAlcanzado` pasa a `true`.
   - La propiedad calculada `modoPermiteEmision` se vuelve `false`.
   - El botón de emisión desaparece o queda deshabilitado (`:disabled="isGenerating || topeAlcanzado"`).
   - Se muestra la tarjeta informativa destacada:
     > *"Límite de turnos alcanzado hoy: Se ha alcanzado el número máximo de turnos asignados para esta jornada."*
   - Los turnos que ya fueron emitidos antes de alcanzar el tope continúan siendo atendidos normalmente en ventanillas.

---

## 6. Reinicio del Contador de Kiosko (`POST /admin/kiosko/reiniciar-contador`)

Cuando el administrador decide reiniciar los turnos digitales (por ejemplo, para comenzar un nuevo turno de atención por la tarde desde el `#1`):

### 6.1 Secuencia Atómica en Backend
1. **Reinicio de Contador y Salto de Sesión:**
   ```sql
   INSERT INTO kiosko_contador_diario (fecha, ultimo_numero, sesion, actualizado_en)
   VALUES ($1, 0, 1, NOW())
   ON CONFLICT (fecha)
   DO UPDATE SET
     ultimo_numero = 0,
     sesion = COALESCE(kiosko_contador_diario.sesion, 1) + 1,
     actualizado_en = NOW()
   RETURNING sesion
   ```
   *Efecto Clave:* Al avanzar `sesion = sesion + 1`, la restricción única `ux_turnos_kiosko_dia_numero(fecha_turno, sesion, numero)` permite emitir nuevamente los turnos `#1`, `#2`, `#3` sin colisionar con los registros anteriores.
2. **Cancelación en Masa de Turnos Huérfanos:**
   Todos los turnos de kiosko de hoy que se encontraban en estado `'esperando'` pasan a `'cancelado'` con `finalizado_en = NOW()`.
3. **Auditoría Inmutable:** Se registra el evento en `audit_log` con acción `CONFIG_MODIFICADA` y detalle `KIOSKO_CONTADOR_REINICIADO`.
4. **Difusión en Tiempo Real (WebSockets):**
   - Canal `admin:all`: Notifica `contador_kiosko_reiniciado` con el conteo de turnos cancelados.
   - Canal `kiosko:publico`: Notifica `contador_reiniciado` con `ultimo_numero: 0`.
   - Canal `tv:global`: Notifica `contador_kiosko_reiniciado` (`proximo_numero: null`).
   - Canal `lote:activo`: Notifica `proximo_actualizado` (`proximo_numero: null`).

### 6.2 Comportamiento en los Clientes Frontend
- **En el Smartphone del Estudiante:**
  Al consultar el estado de su turno, el backend reporta `estado: 'cancelado'`. La interfaz conmuta a la tarjeta rosa de inasistencia/cancelación y despliega el botón **"Tomar un nuevo turno"** (`liberarTurnoSeguimiento()`). Al presionarlo, se limpia `localStorage` y el estudiante puede solicitar de inmediato un nuevo turno que pertenecerá a la nueva sesión.
- **En la Tablet de Portería:**
  Si estaba mostrando un comprobante, limpia la pantalla y retorna a la vista de bienvenida (`step = 'welcome'`), lista para asignar el turno `#1` de la nueva sesión.
- **En la Pantalla Pública TV:**
  Limpia las colas pendientes de llamadas de kiosko, oculta el recuadro "Próximo en espera" (`proximoNumero = null`) y queda a la espera de los llamados de la nueva sesión.

---

## 7. Catálogo Completo de Escenarios (Comunes y Extraordinarios)

### 5.1 ¿Qué pasa si quiero volver a asignarme otro turno en modo estudiante?
* **Regla de Negocio:** El sistema restringe a **1 solo turno activo en espera por dispositivo móvil** para evitar que estudiantes acaparen turnos o generen números ficticios.
* **Comportamiento en Frontend y Backend:**
  1. Si un estudiante ya tiene un turno en estado `esperando` o `en_atencion`, su clave está almacenada en `localStorage.turnero_mi_turno`.
  2. Si el estudiante recarga la página o entra a `/kiosko.html`, el método `init()` detecta el turno guardado y **lo transfiere inmediatamente al paso de seguimiento** (`step = 'seguimiento'`), impidiéndole ver el botón de bienvenida.
  3. Si el estudiante intenta hacer trampa limpiando manualmente el `localStorage` o abriendo una pestaña en incógnito:
     - El backend valida el encabezado `X-Device-Id` y la IP.
     - La consulta SQL en `src/modules/kiosko/service.js` comprueba:
       ```sql
       SELECT id, numero, token_consulta, estado FROM turnos
       WHERE device_id = $1 AND estado = 'esperando' AND fecha_turno = $2
       ```
     - Si encuentra un turno activo para ese dispositivo en la fecha de hoy, **no incrementa el contador ni crea un turno nuevo**: devuelve exactamente el mismo turno que ya tenía emitido.
  4. **¿Cómo puede sacar un nuevo turno legítimamente?**
     - Únicamente cuando su turno previo pasa a estado `'atendido'` o `'cancelado'`, se habilitan en pantalla los botones **"Finalizar seguimiento"** o **"Tomar un nuevo turno"** (`liberarTurnoSeguimiento()`).
     - Esta función borra la clave `turnero_mi_turno`, apaga el WakeLock y regresa al paso `welcome`, permitiéndole solicitar un nuevo turno para otro trámite.
  5. **Turnos de Días Anteriores:** Si el estudiante conservaba en su teléfono un turno de ayer, al abrir la pantalla el método `sincronizarSeguimiento()` detecta que `fecha_turno !== fechaHoy`, limpia automáticamente el almacenamiento local y le permite emitir su turno del día actual sin errores.

---

### 5.2 ¿Qué pasa si el administrador desactiva el servicio de Kiosko?
* **Situación:** El administrador cambia `kiosko_web_activo = false` o pasa el modo a `voucher_fisico`.
* **Comportamiento en Tiempo Real:**
  1. El WebSocket emite `config_actualizada` en el canal `kiosko:publico`.
  2. La propiedad `kioskoActivo` pasa a `false`.
  3. El botón principal "Tomar mi turno" desaparece de inmediato (`x-if="modoPermiteEmision"`).
  4. Aparece el banner ámbar de bloqueo institucional:
     > *"Servicio pausado: El servicio digital no está admitiendo turnos en este momento. Solicite su voucher físico."*
  5. **Intento de Petición HTTP Simultánea:** Si un estudiante justo tocó el botón en el milisegundo exacto de la desactivación, el endpoint `POST /turnos/generar` rechaza la solicitud con código HTTP **403 Forbidden** (`codigo: 'kiosko_desactivado'`).
  6. **¿Qué pasa con los estudiantes que ya estaban en fila de espera?**  
     Los estudiantes que ya tienen un token emitido **NO pierden su turno ni su pantalla de seguimiento**. El endpoint de consulta `GET /turnos/mi-turno/:token` continúa activo para que los turnos ya otorgados puedan ser llamados y atendidos normalmente en ventanilla.

---

### 5.3 ¿Qué pasa cuando el administrador cambia de modalidad (Asistido vs Estudiantil)?
El sistema valida de forma bidireccional y excluyente la compatibilidad del dispositivo con la modalidad activa:

* **Caso A: El sistema cambia a "Modalidad Estudiantil" (Autoservicio Móvil QR):**
  - **En Celulares:** El botón "Tomar mi turno" se habilita.
  - **En la Tablet de Portería (`?modo=tablet`):** El botón "Asignar siguiente" se deshabilita y se oculta. El encabezado cambia a *"Modalidad asistida • Deshabilitada"* y se muestra el aviso:  
    > *"Modalidad Estudiantil activa: La atención se realiza mediante autoservicio estudiantil móvil escaneando el código QR oficial. La asignación desde tablet está pausada."*
* **Caso B: El sistema cambia a "Modalidad Asistida" (Portería):**
  - **En la Tablet de Portería:** Se desbloquea de inmediato el botón "Asignar turno".
  - **En Celulares:** Si un estudiante escanea el QR desde su teléfono, el botón de toma de turno se bloquea y se muestra:  
    > *"Atención asistida en portería: La entrega de turnos se realiza en el módulo de recepción o portería. Solicite su comprobante al personal."*

---

### 5.4 Doble Clic Rápido o Pérdida de Paquetes en la Red (Idempotencia)
* **Situación:** Un usuario nervioso presiona 3 veces seguidas el botón táctil o la red local Wi-Fi pierde el paquete de respuesta HTTP.
* **Comportamiento en Frontend:**
  1. Al primer toque, `isGenerating` pasa a `true`, bloqueando el botón (`:disabled="isGenerating"`), y se genera una clave criptográfica única `currentIdempotencyKey` (UUID v4).
  2. Esta clave viaja en los encabezados `Idempotency-Key` y en el cuerpo de la petición.
* **Comportamiento en Backend:**
  1. Si llega una segunda petición con la misma `Idempotency-Key` en menos de 60 segundos, el backend **no genera un segundo turno**: localiza el turno previamente registrado con esa clave y devuelve el mismo payload.
  2. Si ocurre un error de timeout en el navegador, el botón cambia a **"Reintentar"** (`reintentar()`). Al pulsar reintentar, el frontend reutiliza la misma clave de idempotencia pendiente, evitando que el estudiante consuma dos números por problemas de señal.

---

### 5.5 Reinicio de Contador de Kiosko desde el Panel Admin
* **Situación:** El administrador reinicia el contador correlativo de kiosko a mitad del día (`POST /admin/kiosko/reiniciar-contador`).
* **Comportamiento en Frontend:**
  1. El servidor incrementa el identificador de `sesion` y reinicia el contador diario a 0.
  2. Emite el evento WebSocket `contador_kiosko_reiniciado` a todos los clientes.
  3. Las tablets en portón vacían su ticket visible y regresan a la pantalla de bienvenida.
  4. Si un estudiante tenía un turno de la sesión anterior en espera:
     - El backend marca los turnos no atendidos de la sesión anterior como cancelados.
     - Al sincronizar su estado, el teléfono del estudiante detecta `estado = 'cancelado'`, muestra el aviso correspondiente y le permite presionar **"Tomar un nuevo turno"** para incorporarse a la nueva sesión.

---

### 5.6 ¿Qué pasa si se alcanza el Tope Diario de Turnos?
* **Situación:** El administrador configuró un límite diario (`kiosko_tope_diario = 300`) y se emite el turno número 300.
* **Comportamiento:**
  1. El query atómico en PostgreSQL valida:
     ```sql
     WHERE kiosko_contador_diario.ultimo_numero < $2
     ```
     Al llegar a 300, la instrucción no devuelve filas.
  2. El backend responde con código HTTP **409 Conflict** (`codigo: 'tope_diario_alcanzado'`).
  3. En el frontend, `topeAlcanzado` pasa a `true`.
  4. El botón de generación se bloquea y se muestra la tarjeta informativa:  
     > *"Límite de turnos alcanzado hoy: Se ha alcanzado el número máximo de turnos asignados para esta jornada."*

---

### 5.7 Caída de Conexión en el Celular del Estudiante durante el Seguimiento
* **Situación:** El estudiante entra a una zona del auditorio con mala cobertura Wi-Fi/4G mientras espera su turno.
* **Comportamiento:**
  1. El pill superior cambia a amarillo ámbar: `Reconectando...`.
  2. Cuando el script ejecuta la sincronización periódica (`sincronizarSeguimiento()`) y la petición HTTP falla:
     - **Cero Pantallas de Error:** El sistema **NO** borra el número de turno ni saca al estudiante de su pantalla.
     - Activa la bandera `errorTemporalConexion = true`.
     - Muestra un aviso sutil: *"Reconectando con el servidor... Conservando tu turno"*.
     - Activa un mecanismo de reintento automático con backoff exponencial suave:
       $$\text{delay} = \min(1000 \times 1.5^{\text{reintentos}}, 10000)\text{ ms}$$
  3. En cuanto el teléfono recupera señal, el estado se revalida silenciosamente y el banner se oculta sin intervención del estudiante.

---

### 5.8 Teléfono en Bloqueo o Cambio de Aplicación
* **Situación:** El estudiante bloquea la pantalla o abre WhatsApp mientras espera en el auditorio.
* **Comportamiento:**
  1. **Screen WakeLock:** Al iniciar el seguimiento, el Kiosko solicita mantener la pantalla encendida (`navigator.wakeLock.request('screen')`), reduciendo la probabilidad de que el teléfono se suspenda.
  2. **Evento VisibilityChange:** Si el estudiante minimizó el navegador y vuelve a abrir la pestaña:
     - El listener `_onVisibilityHandler` detecta `document.visibilityState === 'visible'`.
     - Aplica un control de frecuencia (throttle de 10 segundos) para no saturar el servidor y dispara inmediatamente `sincronizarSeguimiento(token)`.
     - Si el turno fue llamado mientras la pantalla estuvo apagada, el estudiante recibe al instante la notificación visual esmeralda y el chime de aviso.

---

### 5.9 Cancelación de Turno por Inasistencia ("No se presentó")
* **Situación:** El operador de ventanilla esperó al estudiante, pero tras 2 llamados este no acudió y el operador presionó "No se presentó".
* **Comportamiento en el Celular del Estudiante:**
  1. El estado del turno en base de datos cambia a `'cancelado'`.
  2. En la siguiente sincronización (vía WS `llamados` o consulta periódica de 30s):
     - La pantalla pasa al estado `cancelado` (`step = 'seguimiento'`).
     - Se detiene el temporizador periódico de sincronización.
     - Aparece la tarjeta de advertencia: *"Turno no presentado o cancelado por inasistencia o cambio de jornada"*.
     - Se muestra el botón secundario **"Tomar un nuevo turno"**, permitiendo liberar el `localStorage` y volver a formarse si las autoridades lo autorizan.

---

## 6. Checklist de Validación y Calidad UI/UX

Antes de homologar cualquier ajuste en el módulo de Kiosko:

- [ ] ¿Cero emojis presentes en toda la interfaz (100% iconos vectoriales SVG con trazo fino)?
- [ ] ¿El fondo general respeta el token visual `#EEF2F6` y las tarjetas usan blanco `#FFFFFF` con borde `#CBD5E1`?
- [ ] ¿El número de ticket (#047) utiliza tipografía `JetBrains Mono` (`font-mono-num`) con números tabulares?
- [ ] ¿En tablet pública (`?modo=tablet`) el auto-reset retorna a inicio tras 15 segundos y permite avance rápido con "Asignar siguiente"?
- [ ] ¿En smartphone de estudiante se restringe estrictamente la emisión a 1 turno activo por dispositivo?
- [ ] ¿Al ser llamado el turno en ventanilla se activan simultáneamente el chime institucional, la vibración del teléfono y la tarjeta esmeralda?
- [ ] ¿Ante pérdida momentánea de conexión móvil se conserva visible el ticket del estudiante sin pantallas de error fatales?
- [ ] ¿Si el administrador desactiva el servicio o cambia la modalidad, la interfaz refleja el bloqueo de forma inmediata?
