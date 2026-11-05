# 📺 Especificación Técnica Frontend: Pantalla Pública TV (`tv.html` / `tv.js`) — v2.1
> **Archivo de Vista:** [`src/public/tv.html`](file:///c:/Users/windows%2010%20pro/Downloads/Turnero/src/public/tv.html)  
> **Controlador Modular:** [`src/public/js/pages/tv.js`](file:///c:/Users/windows%2010%20pro/Downloads/Turnero/src/public/js/pages/tv.js)  
> **Módulo de Síntesis Vocal:** [`src/public/js/audio/speech.js`](file:///c:/Users/windows%2010%20pro/Downloads/Turnero/src/public/js/audio/speech.js)  
> **Tokens Visuales y Tipografía Fluida:** [`src/public/css/tv-tokens.css`](file:///c:/Users/windows%2010%20pro/Downloads/Turnero/src/public/css/tv-tokens.css)  
> **Normativas UI/UX:** `ui-design.md` § 5.3, § 6.3 | `frontend-architecture.md` | `general.md` (RF-TV-01 a RF-TV-05, RNF-DIS-03)

---

## 1. Visión General y Propósito del Módulo

La pantalla pública de TV está diseñada para funcionar como un **display pasivo 100% autónomo y resiliente** en televisores de auditorio de 40" o más a resoluciones Full HD (1080p), 2K, 4K y pantallas divididas. 

No requiere interacción humana cotidiana con ratón o teclado para su funcionamiento continuo. En caso de microcortes de red, fallos en el motor de voz del navegador, ráfagas masivas de llamados simultáneos o cambios de configuración en caliente por parte del administrador, la pantalla está blindada para **nunca mostrar una pantalla en blanco ni desfasar la cola de turnos**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        VIEWPORT 1080p (h-screen)                       │
│ ┌──────────────────────────────────────────────┐ ┌───────────────────┐ │
│ │                  HERO CARD                   │ │  HISTORIAL FIFO   │ │
│ │             (Columna ~65% ancho)             │ │(Columna ~35% ancho│ │
│ │  ┌────────────────────────────────────────┐  │ │ ┌───────────────┐ │ │
│ │  │    PRÓXIMO EN ESPERA: #048             │  │ │ │ TURNOS PREVIOS│ │ │
│ │  └────────────────────────────────────────┘  │ │ │ #046  Mesa 1  │ │ │
│ │                                              │ │ │ #045  Mesa 4  │ │ │
│ │                  #047                        │ │ │ #044  Mesa 2  │ │ │
│ │       (JetBrains Mono Colosal ~220px)        │ │ │ #043  Mesa 3  │ │ │
│ │                                              │ │ └───────────────┘ │ │
│ │  ┌────────────────────────────────────────┐  │ │                   │ │
│ │  │       DIRÍJASE A: MESA 3               │  │ │                   │ │
│ │  └────────────────────────────────────────┘  │ │                   │ │
│ └──────────────────────────────────────────────┘ └───────────────────┘ │
│ ├────────────────────────────────────────────────────────────────────┤ │
│ │ FOOTER: [Volver] [Toggle Historial] | WS Sync | Voz TV | Reloj 1080p│
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Invariantes de la Máquina de Estados (`tv.js`)

Para asegurar consistencia determinista entre múltiples pantallas sincronizadas por LAN, `tv.js` opera bajo 5 invariantes fundamentales:

1. **Una Sola Fuente de Verdad Visual:**
   - `ultimoLlamado` (Hero): Representa estrictamente el turno en exhibición activa actual.
   - `proximoNumero`: Derivado exclusivamente del estado actual del sistema o del lote.
   - `historial`: Lista FIFO de los últimos 4 turnos ya anunciados, ordenados de forma descendente (`seq DESC`). **Invariante absoluta: El turno visible en el Hero NUNCA figura en el historial**.
2. **Cola FIFO Estricta por Secuencia (`seq`):**
   - Todos los llamados de mesas entran a una única cola interna `_cola`. Si 5 mesas llaman al mismo tiempo, los eventos se encolan y se procesan uno por uno en orden de llegada sin saltearse ni solaparse.
3. **Anunciador Secuencial con Tiempo Fijo:**
   - Cada turno se exhibe en pantalla durante exactamente `CFG.tiempoVisualizacionMs = 4000` ms (4 segundos). El audio (campana + voz) corre en paralelo. La tarjeta nunca pasa "volando" si la voz fue corta, ni se corta si la voz tarda.
4. **Tratamiento del Re-llamado (SEGUNDO AVISO):**
   - Un re-llamado entra a la cola con estilo ámbar transitorio (`glowState = 'rellamado'`).
   - **No expulsa** el último turno legítimo al historial.
   - **No entra** al historial cuando termina su exhibición.
   - Al concluir los 4 segundos, si no hay nuevos turnos en cola, el Hero restaura automáticamente el último turno legítimo anterior.
5. **Watchdog de Seguridad (15 Segundos):**
   - Si la síntesis de voz del navegador se cuelga o no emite el evento `onend`, un temporizador de 15 segundos fuerza el avance automático de la cola para desbloquear la pantalla.

---

## 3. Estado Reactivo de Alpine.js (`tvView`)

El componente se registra de forma desacoplada mediante `Alpine.data('tvView', ...)` y expone las siguientes propiedades reactivas:

| Propiedad | Tipo | Valor Inicial | Propósito |
|---|---|---|---|
| `ultimoLlamado` | `Object` | `{ numero: null, mesa_numero: null, proximo: null, llamado_en: null }` | Datos del turno que ocupa la tarjeta principal (Hero). |
| `proximoNumero` | `number\|null` | `null` | Número en el badge "Próximo en espera: #XXX". |
| `historial` | `Array` | `[]` | Lista de hasta 4 turnos completados `{ numero, mesa_numero, llamado_en, tiempoRelativo }`. |
| `glowState` | `string` | `'idle'` | Estado visual de la tarjeta: `'idle'` (reposo/borde slate), `'nuevo'` (azul pulsante), `'rellamado'` (ámbar pulsante). |
| `colaPendiente` | `number` | `0` | Cantidad de llamados en cola de espera para anunciarse (muestra pill `+N en cola`). |
| `escalaPrincipal` | `number` | `100` | Factor de escala porcentual (75 a 140) del Hero y la Mesa. |
| `escalaSecundaria` | `number` | `100` | Factor de escala porcentual (75 a 140) del Historial y textos secundarios. |
| `opacidadPrincipal`| `number` | `100` | Opacidad porcentual (20 a 100) del fondo blanco de la tarjeta principal. |
| `opacidadSecundaria`| `number` | `100` | Opacidad porcentual (20 a 100) del fondo blanco de las tarjetas del historial. |
| `mostrarHistorial` | `boolean` | `true` | Determina si se muestra la columna lateral derecha o si el Hero ocupa el 100% (`.solo-hero`). |
| `modo` | `string` | `'voucher_fisico'` | Modo operativo activo: `'voucher_fisico'`, `'kiosko_web'` o `'mixto'`. |
| `wsConnected` | `boolean` | `false` | Estado de conexión WebSocket en vivo. |
| `reconnecting` | `boolean` | `false` | Activa el banner flotante de reconexión tras 3 segundos de gracia. |
| `reconnectMsg` | `string` | `'Reconectando...'` | Mensaje descriptivo con el número de intento y segundos restantes. |
| `audioSuspended` | `boolean` | `false` | Indica si el `AudioContext` de la Web Audio API fue suspendido por falta de interacción. |
| `vozActiva` | `boolean` | `true` | Habilita o silencia la locución verbal de turnos. |
| `vozBloqueada` | `boolean` | `false` | Indica si el navegador bloqueó `speechSynthesis` por política de autoplay. |
| `relojHora` | `string` | `'--:--:--'` | Hora digital Full HD (`HH:MM:SS`) actualizada cada 1 segundo. |
| `relojFecha` | `string` | `'--'` | Fecha formateada en español (`DD Mes YYYY`). |

---

## 4. Sistema de Audio Híbrido Resiliente

La pantalla combina dos capas de audio completamente desacopladas para garantizar anuncios claros incluso en entornos offline o con restricciones de navegador:

```
Evento nuevo_llamado / turno_rellamado
                  │
                  ▼
         playCallChime() (utils.js)
        ┌─────────┴─────────┐
        ▼                   ▼
    Audio MP3         Web Audio API
  (/assets/bell.mp3)  Fallback Oscilador
                      (C5 523Hz + E5 659Hz)
                  │
                  ▼ (Al terminar la campana)
         speakCall() (speech.js)
                  │
                  ▼
     Web Speech API (speechSynthesis)
     "Turno 47, Mesa 3" (sin ceros)
```

### 4.1 La Campana Institucional (`playCallChime`)
1. **Archivo nativo:** Intenta reproducir el recurso estático `/assets/audio/bell.mp3`.
2. **Fallback Web Audio API:** Si el archivo no existe, falla la red local o hay bloqueo CORS, sintetiza en milisegundos un acorde bifónico institucional (Nota C5: 523.25 Hz + Nota E5: 659.25 Hz) con envolvente de ganancia exponencial suave.

### 4.2 Síntesis de Voz Resiliente (`speech.js`)
- **Texto limpio:** Emite una locución directa y concisa: *"Turno 47, Mesa 3"*. Se eliminan ceros a la izquierda para que el sintetizador no diga "cero cero cuarenta y siete".
- **Blindaje contra el Garbage Collector de Chrome:** En navegadores Chromium, si una instancia de `SpeechSynthesisUtterance` se crea dentro de una función local, el GC puede destruirla antes de que termine de hablar, cancelando el evento `onend`. `speech.js` mantiene una referencia global retenida `_activeUtterance` a nivel de módulo durante toda la locución.
- **Selección de Voz Inteligente:** Detecta voces en español priorizando motores naturales (`Google español`, `Microsoft Helena/Sabina/Paulina/Laura`).
- **Limpieza de Cola de Chrome:** Ejecuta `window.speechSynthesis.cancel()` antes de cada emisión para evitar utterances congeladas en la cola nativa de Chromium.
- **Timeout de Seguridad:** Cuenta con un timeout interno de 3.5 segundos que desbloquea la promesa en caso de motores TTS con latencia.

### 4.3 Detección y Desbloqueo de Políticas de Autoplay
Los navegadores modernos prohíben la reproducción de audio hasta que el usuario realice al menos un clic o toque en la pantalla:
1. **Banner "Toque la pantalla para activar el sonido":** Se activa cuando `audioSuspended === true`. Un clic en cualquier parte de la pantalla ejecuta `testCtx.resume()` y oculta el aviso.
2. **Banner "Voz bloqueada — toque la pantalla para activar":** Se activa cuando `vozActiva === true` pero `speechSynthesis` rechaza hablar con el error `not-allowed`. Al interactuar con la pantalla, la bandera se resetea automáticamente.

---

## 5. Control Dinámico de Estilos y Tokens en Tiempo Real

El diseño de la pantalla pública puede ajustarse desde el Panel de Administración sin necesidad de recargar la página ni alterar el código:

### 5.1 Escalas Tipográficas Independientes (`75%` a `140%`)
- **Escala Principal (`tv_escala_principal`):** Controla el tamaño del número gigante colosal en el Hero y el texto de la Mesa. Escribe la variable CSS `--tv-escala-principal`.
- **Escala Secundaria (`tv_escala_secundaria`):** Controla los números de las tarjetas de turnos anteriores en el historial lateral. Escribe la variable CSS `--tv-escala-secundaria`.
- **Protección Anti-desborde Horizontal (`_ajustarTamanoTicket`):**
  Ejecutada tras cada nuevo turno o redimensionamiento (`resize`):
  ```javascript
  // Si el número tiene 4 o más cifras (ej: 1250) o la pantalla es muy angosta:
  if (currentW > maxW) {
    const ratioW = Math.max(0.60, Math.min(1.0, maxW / currentW));
    ticketEl.style.setProperty('--tv-ticket-fit', ratioW.toFixed(3));
  }
  ```
  Esto reduce matemáticamente el número colosal mediante `--tv-ticket-fit` sin romper la cuadrícula ni generar barras de desplazamiento.

### 5.2 Opacidad de Tarjetas y Fondo Institucional
- **Opacidades independientes (20% a 100%):** Controladas mediante `tv_opacidad_principal` y `tv_opacidad_secundaria`. Permiten tarjetas semitransparentes sobre fondos fotográficos sin perder contraste tipográfico.
- **Fondo Institucional Personalizado:** Soporta imágenes de fondo institucionales vía `fondo_imagen_url` con control de escala (50% a 200%), alternando entre `cover` o dimensiones proporcionales en `vw`/`vh`.
- **Vistas previas en caliente (Live Preview):**
  Cuando el administrador mueve los controles deslizantes en su panel, el servidor emite eventos WebSocket instantáneos (`preview_escala_tv`, `preview_opacidad_tv`, `preview_escala_fondo`). La TV refleja los cambios en tiempo real antes de que el administrador presione "Guardar".

### 5.3 Sincronización Multi-Pestaña Local (`StorageEvent`)
Si hay varias pantallas TV conectadas al mismo navegador (ej. salidas multipantalla de una misma PC con tarjeta gráfica multimonitor), cualquier cambio guardado en `localStorage` por una pestaña dispara el listener `window.addEventListener('storage', ...)` en las demás, replicando de inmediato las escalas y opacidades sin tráfico de red adicional.

---

## 6. Alternancia de Modos y Cálculo del "Próximo Turno"

El comportamiento del recuadro superior **"Próximo en espera"** varía según el modelo operativo activo:

### 6.1 Modo `voucher_fisico` (Por defecto)
- **Concepto:** Los vouchers de papel fueron entregados correlativamente en el portón exterior.
- **Cálculo del Próximo:**
  $$\text{proximo} = \text{ultimoLlamado.numero} + 1$$
- Si el turno en pantalla es el `#047`, la pantalla asume automáticamente que el siguiente estudiante con ticket en la mano es el `#048`.
- Si el lote se extiende en caliente, el evento WS `lote_extendido` actualiza `proximoNumero` con el nuevo valor emitido por el backend.
- Si el lote se pausa o agota, `proximoNumero` pasa a `null` y el recuadro se oculta limpiamente (`x-show="proximoNumero !== null"`).

### 6.2 Modo `kiosko_web` (Asistido / Estudiantil)
- **Concepto:** Los estudiantes generan su turno digitalmente en un kiosko o smartphone. No necesariamente hay correlatividad fija si no hay nadie esperando.
- **Cálculo del Próximo:**
  - El valor de `proximo` **no se calcula localmente por suma aritmética**.
  - Proviene obligatoriamente del payload emitido por el servidor (`payload.proximo` o `payload.proximo_numero`), el cual consulta la cola real de la tabla `turnos` en base de datos (`estado = 'esperando'`).
  - Si la cola digital está vacía, `proximoNumero = null` y el banner se oculta hasta que ingrese un nuevo estudiante.
  - Al recibir el evento WS `contador_kiosko_reiniciado`, la pantalla vacía de inmediato las colas pendientes, oculta el próximo turno y solicita un nuevo snapshot.

### 6.3 Transición de Modo en Tiempo Real
Si el administrador cambia el modo desde el panel de control:
1. El WebSocket emite `config_actualizada` con `clave: 'modo_generacion_turnos'` o `'kiosko_web_activo'`.
2. La TV actualiza su propiedad `this.modo`.
3. Inmediatamente ejecuta `this._solicitarSnapshot()` para que el backend recalcule la cola según las nuevas reglas operativas y actualice el Hero sin reiniciar la aplicación.

---

## 7. Catálogo Completo de Escenarios (Comunes y Extraordinarios)

### 7.1 Ráfaga Masiva de Llamados Concurrentes
* **Situación:** 10 operadores en ventanillas presionan "Llamar Siguiente" exactamente al mismo segundo.
* **Comportamiento en Frontend:**
  1. La TV recibe 10 mensajes WebSocket `nuevo_llamado` en milisegundos.
  2. Cada mensaje pasa por el filtro de deduplicación de `_seqVistos` y `eventoId`.
  3. Los 10 turnos se apilan en `this._cola` en orden de llegada.
  4. La insignia en la esquina superior del Hero muestra `+9 en cola`.
  5. El reproductor procesa el primer turno durante 4 segundos completos con su respectivo chime y audio de voz.
  6. Al cumplirse los 4 segundos, el primer turno pasa al Historial (empujando hacia abajo a los anteriores) y el segundo turno toma el Hero, actualizando la insignia a `+8 en cola`.
  7. **Límite de Desborde:** Si la cola supera `CFG.maxCola = 50` ítems (ej. prueba de estrés masiva), los ítems más antiguos se descartan de la cola de voz y se envían de forma silenciosa y ordenada directo al historial para no colapsar la memoria del navegador.

---

### 7.2 Re-llamado de Turno (SEGUNDO AVISO)
* **Situación:** El estudiante de la Mesa 2 no se presenta de inmediato y el operador presiona "Re-llamar Turno".
* **Comportamiento en Frontend:**
  1. El servidor emite `turno_rellamado`.
  2. El evento entra a la cola única. Al ser ejecutado por el reproductor:
     - `glowState` cambia a `'rellamado'`.
     - El borde de la tarjeta Hero y el badge cambian a **ámbar** (`pulse-call-amber border-amber-500 ring-4 ring-amber-500/20`).
     - El título superior cambia a: `RE-LLAMANDO TURNO (SEGUNDO AVISO)`.
     - Se reproduce la campana y la locución correspondiente.
  3. **Preservación del Historial:** El turno del re-llamado **NO** expulsa el turno legítimo anterior al historial.
  4. **Restauración Automática:** Al concluir los 4 segundos, si no hay nuevos llamados en cola, la tarjeta restaura los datos del último llamado legítimo (`_ultimoLlamadoReal`) y el `glowState` vuelve a `'idle'`.

---

### 7.3 Re-llamado Repetido Inmediato sobre el Mismo Turno
* **Situación:** Un operador impaciente presiona re-llamar varias veces consecutivas mientras la TV ya está mostrando el segundo aviso de ese mismo turno.
* **Comportamiento en Frontend:**
  1. `tv.js` detecta que el Hero actual ya está en estado `'rellamado'` y contiene ese mismo número de turno (`ultimoLlamado.numero === numero`).
  2. En lugar de crear un duplicado en la cola o reiniciar abruptamente el componente:
     - Reinicia el temporizador de exhibición a 4 segundos completos.
     - Vuelve a disparar la campana y la síntesis de voz.
  3. Si el re-llamado llega con menos de 10 segundos de diferencia para el mismo texto exacto, `speech.js` aplica su filtro interno:
     ```javascript
     if (_ultimoAudio.texto === texto && (ahora - _ultimoAudio.timestamp < 10000))
     ```
     evitando locuciones trabadas o tartamudeo en el altavoz.

---

### 7.4 Llamado de Turno Rezagado
* **Situación:** Un estudiante que llegó tarde es recuperado desde el modal de rezagados de una ventanilla.
* **Comportamiento en Frontend:**
  1. El evento llega con `payload.es_rezagado = true`.
  2. El turno entra a la cola con tipo `'nuevo'`.
  3. Si ese número de turno ya figuraba en la lista de turnos anteriores (porque había sido llamado hace 20 minutos), `_agregarAlHistorial` detecta la coincidencia mediante `findIndex` y elimina la entrada antigua antes de insertar el nuevo estado para evitar duplicados en pantalla.
  4. El campo `proximoNumero` no suma aritméticamente `numero + 1`, sino que mantiene el progreso legítimo del lote general.

---

### 7.5 Microcorte y Caída Prolongada de Red WebSocket
* **Situación:** Se desconecta el cable Ethernet de la TV o se cae el enrutador Wi-Fi del auditorio.
* **Comportamiento en Frontend:**
  1. **Gracia de 3 segundos (`CFG.graciaBannerMs = 3000`):** Si la conexión titubea durante 1 o 2 segundos, el banner de desconexión no parpadea para no alarmar al público en el auditorio.
  2. **Banner Flotante Tras 3 Segundos:** Si la desconexión persiste más de 3 segundos, aparece una barra ámbar deslizante en la parte superior:
     - Icono SVG giratorio (`animate-spin`).
     - Mensaje: *"Reintento #X en Ys..."*.
     - Contador regresivo con el tiempo exacto antes del siguiente intento (backoff exponencial con jitter).
  3. **RNF-DIS-03 / RF-TV-05 (Cero Pantallas Blancas):** En ningún momento se limpian el número colosal del Hero ni el Historial. La pantalla sigue mostrando de forma estática los últimos turnos atendidos.

---

### 7.6 Recuperación de Conexión y Snapshot
* **Situación:** Regresa la conectividad tras 2 minutos de corte.
* **Comportamiento en Frontend:**
  1. `TurneroWSClient` emite el estado `CONECTADO`. El banner flotante se oculta de inmediato.
  2. La TV recibe el evento `snapshot` del servidor con el estado actual de la base de datos.
  3. **Si la TV estaba en reposo (`_reproduciendo === false`):** Se sincroniza de inmediato con el último turno atendido y los últimos 4 turnos históricos enviados por PostgreSQL.
  4. **Si la TV tenía llamadas en cola terminando de reproducirse:** La TV prioriza agotar su cola local antes de sobreescribir el Hero, garantizando que el público escuche todos los turnos que quedaron en vuelo durante la reconexión.

---

### 7.7 Recepción de Eventos con Retraso Severo (> 60 Segundos)
* **Situación:** Un cliente que estuvo suspendido recibe del buffer del servidor un evento `nuevo_llamado` emitido hace más de 1 minuto.
* **Comportamiento en Frontend:**
  1. `tv.js` calcula la antigüedad del turno:
     ```javascript
     const edad = Date.now() - new Date(llamado_en).getTime() + this._serverTimeOffset;
     ```
  2. Si `edad > 60000` (60 segundos) y el reproductor no está activo, el turno **no interrumpe la pantalla con campanas ni voz desactualizada**.
  3. Se inserta en silencio directamente en el historial lateral para mantener el registro visual sin desorientar a los estudiantes en el auditorio.

---

### 7.8 Lote Pausado, Agotado o Cerrado
* **Situación:** Finaliza la jornada matutina y el administrador pausa el Lote 1, o se acaban los números asignados.
* **Comportamiento en Frontend:**
  1. El WebSocket emite `lote_pausado` o `lote_cerrado`.
  2. La TV ejecuta:
     ```javascript
     this.proximoNumero = null;
     ```
  3. El recuadro superior "Siguiente en fila: Próximo en espera" desaparece limpiamente gracias a la directiva `x-show="proximoNumero !== null"`.
  4. El número colosal del Hero permanece visible como referencia hasta el día siguiente.

---

### 7.9 Pestaña Minimizada, Pantalla en Reposo o Cambio de Visibilidad
* **Situación:** La TV está conectada a una PC donde la ventana del navegador pasa a segundo plano o se apaga el monitor.
* **Comportamiento en Frontend (`_initVisibilityChange`):**
  1. **Al pasar a segundo plano:** La cola de turnos no se borra ni se descarta.
  2. **Comportamiento de Chrome:** Los navegadores basados en Chromium pausan automáticamente la síntesis de voz en pestañas inactivas.
  3. **Al volver a estar visible (`visibilitychange -> 'visible'`):**
     - Ejecuta `window.speechSynthesis.resume()` para desbloquear cualquier locución retenida por el sistema operativo.
     - Si la cola tiene ítems pendientes acumulados, reactiva el despachador (`_despacharReproductor()`).
     - Si la cola está vacía, solicita un snapshot para comprobar si hubo turnos nuevos mientras estuvo inactiva.

---

### 7.10 Cuelgue o Falla en el Motor de Síntesis Vocal (Watchdog de 15s)
* **Situación:** En sistemas Linux o navegadores desactualizados sin soporte TTS nativo, `window.speechSynthesis.speak()` puede quedar suspendido indefinidamente sin disparar ni `onstart` ni `onend`.
* **Comportamiento en Frontend:**
  1. Cada vez que se inicia un anuncio, arranca un temporizador de seguridad de 15 segundos (`_watchdogTimer`).
  2. Si transcurren 15 segundos sin que la promesa de audio resuelva:
     - El watchdog interviene automáticamente ejecutando `_forzarAvanceWatchdog()`.
     - Imprime advertencia en consola: `[TV] Watchdog activado (> 15 s sin terminar). Forzando avance.`
     - Cancela cualquier audio colgado, limpia el estado de destello visual (`glowState = 'idle'`) y pasa al siguiente turno de la cola.
     - **Resultado:** La pantalla de TV nunca se queda congelada indefinidamente ante fallos del sistema operativo.

---

### 7.11 Activación / Desactivación de Voz en Tiempo Real
* **Situación:** El administrador silencia la voz desde su panel de control o un encargado presiona el botón "Voz TV" en el footer de la pantalla.
* **Comportamiento en Frontend:**
  - **Vía Footer:** Al presionar el botón `toggleVoz()`, conmuta `this.vozActiva` y llama a `setSpeechEnabled(this.vozActiva)`. El icono del footer cambia de altavoz con ondas a altavoz tachado.
  - **Vía Admin WebSocket:** Si el administrador cambia el ajuste global, llega el evento `config_actualizada` con `clave: 'voz_anuncio_activa'`, actualizando el estado de la TV en menos de 50 ms.
  - **Efecto Inmediato:** Si la voz se apaga mientras el sistema está hablando, se ejecuta inmediatamente `window.speechSynthesis.cancel()`, silenciando el televisor en el acto. La campana institucional (chime) y el avance de las tarjetas visuales continúan operando con total normalidad.

---

### 7.12 Ocultar / Mostrar Turnos Anteriores (Modo Solo Hero)
* **Situación:** El encargado del auditorio prefiere que la pantalla no muestre el historial lateral, sino un único turno gigantesco centrado.
* **Comportamiento en Frontend:**
  1. Al presionar el botón de columnas en el footer (`toggleHistorial()`):
     - Alterna la variable `this.mostrarHistorial`.
     - Guarda la preferencia en el navegador local (`localStorage.setItem('turnero_tv_mostrar_historial', ...)`).
  2. La grilla principal recibe la clase CSS `.solo-hero`:
     - La columna del historial se oculta con `x-show="mostrarHistorial"`.
     - La columna del Hero se expande a 12 columnas completas, centrándose horizontalmente con un ancho máximo estético de `min(70%, 900px)`.
     - El tamaño de fuente del número colosal escala automáticamente de `24rem` a `30rem` (`clamp(8rem, min(34vh, 28vw), 30rem)`).
     - La función `_ajustarTamanoTicket()` se ejecuta en el siguiente ciclo (`$nextTick`) para verificar que el nuevo tamaño encaje exactamente en la pantalla.

---

### 7.13 Pantalla Dividida o Formato Vertical (Media Queries Responsivos)
* **Situación:** La ventana del navegador se divide a la mitad de la pantalla (medio ancho) o se proyecta en un tótem con orientación vertical.
* **Comportamiento en Frontend (`tv-tokens.css` § 6):**
  1. La media query `@media (max-width: 1023px), (max-aspect-ratio: 1.15)` toma el control del diseño:
     - El contenedor `.tv-main-grid` deja de ser una cuadrícula de dos columnas horizontales y pasa a una disposición vertical ergonómica en columna (`flex-direction: column`).
     - El Hero ocupa la parte superior con un peso relativo (`flex: 1.35`).
     - Las 4 tarjetas de turnos anteriores se reorganizan en una **cuadrícula de 2x2 filas y columnas** en la parte inferior, optimizando el ancho disponible.
     - Cero barras de desplazamiento horizontal o vertical (`overflow-hidden`).

---

## 8. Checklist de Validación y Control de Calidad (UI Review)

Antes de homologar cualquier actualización en la pantalla de TV, verificar:

- [ ] ¿Cero emojis presentes en el DOM, banners, botones y títulos (100% iconos SVG vectoriales)?
- [ ] ¿El fondo institucional base es `#EEF2F6` y las tarjetas poseen borde `#CBD5E1`?
- [ ] ¿El número de turno gigante, la mesa y el reloj Full HD utilizan tipografía `JetBrains Mono` (`font-mono-num`) con números tabulares?
- [ ] ¿La pantalla cabe exactamente en el alto del viewport sin generar scroll vertical u horizontal (`h-screen overflow-hidden`)?
- [ ] ¿Los llamados simultáneos se anuncian de forma secuencial respetando los 4 segundos fijos por turno?
- [ ] ¿Los re-llamados se destacan con borde ámbar y no expulsan el turno legítimo al historial?
- [ ] ¿Ante una desconexión de red se preservan los turnos en pantalla y aparece el banner tras 3 segundos de gracia?
- [ ] ¿El audio cuenta con fallback autónomo mediante la Web Audio API si no carga el archivo MP3?
- [ ] ¿El watchdog de seguridad avanza automáticamente la cola si el motor de voz del sistema operativo no responde?
