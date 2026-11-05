# 🛠️ Especificación Técnica Frontend: Panel de Administración (`admin.html` / `admin.js`) — v2.1
> **Archivo de Vista:** [`src/public/admin.html`](file:///c:/Users/windows%2010%20pro/Downloads/Turnero/src/public/admin.html)  
> **Controlador Modular:** [`src/public/js/pages/admin.js`](file:///c:/Users/windows%2010%20pro/Downloads/Turnero/src/public/js/pages/admin.js)  
> **Módulos Backend:** [`src/modules/admin/routes.js`](file:///c:/Users/windows%2010%20pro/Downloads/Turnero/src/modules/admin/routes.js), [`src/modules/mesas/routes.js`](file:///c:/Users/windows%2010%20pro/Downloads/Turnero/src/modules/mesas/routes.js), [`src/modules/lotes/routes.js`](file:///c:/Users/windows%2010%20pro/Downloads/Turnero/src/modules/lotes/routes.js)  
> **Normativas UI/UX:** `frontend-architecture.md` § 6 | `ui-design.md` § 6.4 | `general.md` § 6 (Módulo 6) | RF-ADM-01 a RF-ADM-08

---

## 1. Visión General y Arquitectura

El Panel de Administración es la consola central de supervisión, parametrización y auditoría en caliente del sistema. Opera como una aplicación reactiva basada en Alpine.js estructurada en 5 pestañas principales:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        PANEL DE ADMINISTRACIÓN — TURNERO 2026                          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [📊 Monitoreo en Vivo] [📋 Lotes de Vouchers] [🪑 Mesas] [👥 Usuarios] [📈 Reportes]   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

El panel está conectado permanentemente al canal WebSocket exclusivo `admin:all`. Cualquier evento ocurrido en ventanillas, pantallas de TV o kioskos actualiza los contadores, tablas y semáforos en tiempo real **sin necesidad de refrescar la página**.

---

## 2. Pestaña 1: Monitoreo en Vivo y KPIs (Dashboard)

### 2.1 Los 4 KPIs Superiores en Tiempo Real
1. **Atendidos Hoy:** Conteo acumulado de turnos en estado `'atendido'` en la jornada actual.
2. **Tiempo Promedio de Atención:** Promedio dinámico de `duracion_atencion_seg` formateado en `mm:ss` (calculado automáticamente por triggers en base de datos al finalizar cada atención).
3. **Mesas Activas:** Cantidad de ventanillas en estado `'activa'` que cuentan con un operador conectado físicamente en ese momento.
4. **Vouchers Restantes en Lote / En Espera Kiosko:**
   - En modo `voucher_fisico`: Muestra `numero_hasta - ultimo_numero_llamado`. Se resalta con badge ámbar cuando quedan menos de `alerta_vouchers_restantes` (umbral configurable, por defecto 20).
   - En modo `kiosko_web`: Muestra la cantidad de estudiantes actualmente en cola con ticket emitido.

---

### 2.2 Tabla de Rendimiento por Mesa con Semáforo de Tiempos
Cada fila representa una mesa operativa y muestra:

* **Identificador de Ventanilla:** Número de mesa y nombre asignado (`Mesa 1 - Ventanilla Principal`).
* **Operador en Línea:** Nombre completo del operador autenticado actualmente en la consola.
* **Estado de la Mesa:**
  - **Activa (Pill Verde):** En servicio normal.
  - **Pausada (Pill Ámbar):** El operador detuvo la atención temporalmente.
    - **Visualización del Motivo de Pausa:** Se despliega el motivo explícito seleccionado por el operador (*"Refrigerio / Almuerzo"*, *"Descanso programado"*, *"Problemas técnicos"*, *"Gestión documental"*, etc.).
    - **Cronómetro de Pausa en Vivo:** Se visualiza el tiempo transcurrido desde `pausado_en`, actualizado cada segundo.
  - **Inactiva / Sin Operador (Pill Gris):** Mesa configurada pero sin personal asignado o fuera de servicio.
* **Turno Actual en Atención:**
  - Número de turno en tipografía monoespaciada `JetBrains Mono` (`font-mono-num`).
  - Cronómetro de atención en curso (`mm:ss`) corriendo en vivo desde `llamado_en`.
* **Semáforo Visual de Eficiencia:**  
  Calculado a partir del parámetro editable `tiempo_max_atencion_min` (ej. 4 minutos):
  - **Verde (< 4 min):** Atención dentro del rango óptimo.
  - **Amarillo (4 a 7 min):** Atención demorada (supera el estándar pero dentro del límite de tolerancia).
  - **Rojo (> 7 min):** Alerta crítica de retraso (supera $1.75\times$ el tiempo máximo configurado).
* **Métricas de la Mesa:** Cantidad de turnos atendidos hoy por esa ventanilla específica y su tiempo promedio individual de atención.

---

## 3. Pestaña 2: Gestión de Mesas (Ventanillas)

La gestión de mesas combina cambios estructurales en base de datos con propagación inmediata a consolas de operador y pantallas de login.

### 3.1 Creación de Mesas
- **Campos:** Número (entero $\ge 1$), Nombre descriptivo (ej. "Validación de Títulos"), Estado inicial (`activa` o `inactiva`).
- **¿Qué pasa si intento crear una mesa con un número ya existente?**
  - El backend consulta `SELECT id FROM mesas WHERE numero = $1 AND estado != 'eliminada'`.
  - Si el número ya pertenece a una mesa existente, rechaza con **HTTP 409 Conflict**:  
    > *"El número de mesa X ya está asignado a otra ventanilla."*
  - Si se crea con éxito en estado `activa`, el evento WS `mesas_disponibles_actualizadas` hace que la mesa aparezca de inmediato en la grilla de selección de mesas del login para los operadores disponibles.

---

### 3.2 Edición de Mesas (Nombre o Número)
- Al modificar el nombre o número de una mesa:
  - Se valida que el nuevo número no colisione con otra mesa activa (HTTP 409).
  - Si el cambio es exitoso, se emite el evento WS `mesa_actualizada` al canal de esa mesa (`mesa:id`).
  - **Efecto en la consola del operador:** El encabezado del operador se actualiza en el acto sin recargar la página ni interrumpir el cronómetro ni el turno en curso.

---

### 3.3 Asignación y Reasignación de Operadores
- **Regla Fundamental (RF-AUTH-07):** Un operador **no puede estar asignado a más de una mesa simultáneamente**.
- **¿Qué pasa si asigno un operador que ya tiene otra mesa?**
  - El backend comprueba si el `operador_id` ya figura en otra mesa no eliminada. Si es así, responde con **HTTP 409 Conflict**:  
    > *"Este operador ya está asignado a la Mesa Y. Un operador no puede estar en dos mesas."*
- **¿Qué pasa si reasigno o libero una mesa que tiene un turno en atención activo?**
  - **Cancelación Atómica:** Para no dejar turnos colgados en el limbo, cualquier turno en estado `'en_atencion'` en esa mesa pasa automáticamente a `'cancelado'` con `finalizado_en = NOW()`.
  - Se registra el evento en `audit_log` con motivo `'mesa_reasignada_o_liberada_admin'`.
  - Se notifica a los canales `admin:all` y `lote:activo` (por si el turno cancelado pasa a rezagados).
  - **Desconexión del Operador Previo:** El operador que estaba trabajando en esa mesa recibe el evento WebSocket `mesa_inactivada` con motivo `'operador_reasignado_por_admin'`, expulsándolo de inmediato de la consola de trabajo hacia la pantalla de selección de mesas con un toast explicativo.
- **Auto-Redirección del Nuevo Operador:** Si el operador nuevo tenía abierta la pantalla de selección de mesa en login, el WebSocket `operador_asignado_por_admin` detecta su ID y lo redirige automáticamente al panel de trabajo de la mesa asignada.

---

### 3.4 Desactivación vs. Eliminación de Mesas

| Acción | Endpoint | Si tiene turno en atención | Efecto en la Mesa | ¿Libera el número? |
|---|---|---|---|---|
| **Inactivar / Pausar** | `PATCH /mesas/:id/estado` | **Cancela el turno** atómicamente, libera al operador y limpia motivo. | `estado = 'inactiva'`. La mesa sigue existiendo. | **No.** El número sigue reservado. |
| **Eliminar** | `DELETE /mesas/:id` | **BLOQUEADO.** Si tiene operador con turno activo, arroja **HTTP 409 Conflict**. | Soft-delete: `estado = 'eliminada'`, `eliminado_en = NOW()`. | **Sí.** El número queda libre para crearse de nuevo. |

* **Detalle de Eliminación de Mesa:**
  - Si la mesa tiene un operador asignado y está atendiendo a un estudiante:  
    > *"No se puede eliminar la ventanilla mientras el operador X tenga el turno #Y en atención activo."*  
    El administrador debe esperar a que el operador finalice la atención o inactivar la mesa primero.
  - Si la mesa tenía un turno huérfano (sin operador), se cancela de oficio.
  - Al confirmarse la eliminación, el operador que estaba en esa mesa es expulsado hacia el login mediante el evento WS `mesa_inactivada`.

---

## 4. Pestaña 3: Gestión de Usuarios

### 4.1 Creación de Usuarios
- **Campos:** Username, Nombre Completo, Rol (`operador`, `supervisor`, `admin`), Contraseña (hasheada con bcrypt cost 12).
- **Validación de Unicidad:** Búsqueda case-insensitive (`LOWER(username)`). Si ya existe, responde con **HTTP 409 Conflict**: *"El usuario 'x' ya existe"*.

---

### 4.2 Edición de Usuarios y Desconexión Forzada en Caliente
- **Protección del Último Administrador:**
  Si un administrador intenta desactivar a un usuario admin o degradar su rol a operador:
  - El sistema ejecuta un `SELECT ... FOR UPDATE` para evitar carreras entre administradores concurrentes.
  - Si el conteo de administradores activos restantes es 0, bloquea la acción con **HTTP 400 Bad Request**:  
    > *"No se puede desactivar ni cambiar el rol del único administrador activo del sistema."*
- **¿Qué pasa si desactivo a un operador mientras está atendiendo en una mesa?**
  1. En una sola transacción, todos los turnos en estado `'en_atencion'` asociados a ese usuario en sus mesas se actualizan a `'cancelado'`.
  2. Sus mesas asignadas pasan a `operador_id = NULL` y `estado = 'activa'` (quedando libres para otros).
  3. **Desconexión forzada de sesión:** El servidor elimina la clave de sesión en Redis (`user_active_session:id`) y corta la conexión WebSocket del usuario con código de cierre `4403` (*"Rol modificado o cuenta desactivada"*). Su navegador lo expulsa automáticamente al login.

---

### 4.3 Eliminación de Usuarios
- **Protección de Auto-Eliminación:**
  Un administrador **no puede eliminar su propia cuenta** mientras tenga la sesión activa (HTTP 400: *"No puede eliminar su propia cuenta mientras tiene la sesión activa"*).
- **Protección de Turno en Curso:**
  Si el usuario tiene un turno en atención activo, el backend rechaza la eliminación con **HTTP 409 Conflict**:  
  > *"No se puede eliminar al usuario porque tiene el turno #X en atención actualmente. Finalice o cancele la atención antes de eliminarlo."*
- **Protección del Último Admin:** No permite eliminar al único admin activo.
- **Borrado Lógico y Preservación Histórica:**  
  Se ejecuta `UPDATE usuarios SET eliminado_en = NOW(), activo = false`. Esto preserva el histórico en reportes y auditoría, pero libera el `username` para poder reutilizarlo si fuera necesario.

---

## 5. Pestaña 4: Gestión de Lotes de Vouchers

Controla el flujo físico de turnos correlativos (multi-día o por jornadas):

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               CICLO DE VIDA DE UN LOTE                                 │
├────────────────────┬────────────────────┬────────────────────┬─────────────────────────┤
│ 1. Creado          │ 2. Activo en Sala  │ 3. Pausado         │ 4. Cerrado              │
│ (preparado)        │ (operadores llaman)│ (fin de jornada)   │ (definitivo)            │
│ numero_desde: 1    │ ultimo_numero++    │ congelado en N     │ no admite extensiones   │
│ numero_hasta: 500  │ avanza atómico     │ reactivable mañana │ permite abrir Lote N+1  │
└────────────────────┴────────────────────┴────────────────────┴─────────────────────────┘
```

### 5.1 Regla de Oro: Solo 1 Lote Activo a la Vez
- Garantizado a nivel de motor de base de datos mediante un **índice único parcial**:
  ```sql
  CREATE UNIQUE INDEX ux_lotes_voucher_activo ON lotes_voucher (estado) WHERE estado = 'activo';
  ```
- Si se intenta activar un segundo lote sin haber pausado o cerrado el anterior, la API rechaza con **HTTP 409 Conflict**.

---

### 5.2 Escenarios Clave en la Gestión de Lotes

#### ¿Qué pasa si se llega al límite de turnos (`ultimo_numero_llamado >= numero_hasta`)?
1. Al operador que presiona "Llamar Siguiente" para el último turno, se le asigna el voucher.
2. Inmediatamente, la transacción detecta `nuevo === numero_hasta` y actualiza el lote a `estado = 'agotado'`.
3. El WebSocket emite `lote_agotado` a `admin:all` y a las mesas.
4. **En el Panel del Operador:** El botón "Llamar Siguiente" se deshabilita y se muestra el banner de alerta: *"Lote agotado. Notifique al supervisor"*.
5. **En la TV Pública:** El recuadro superior "Próximo en espera" se oculta.

#### ¿Qué pasa si el administrador extiende el lote en caliente?
1. En la pestaña de Lotes, el admin ingresa el nuevo límite (ej. de 500 a 700) y pulsa "Extender Lote".
2. El endpoint `PATCH /lotes/:id/extender` valida que el nuevo número sea mayor al actual y menor a 100,000.
3. Si el lote estaba en estado `'agotado'`, **se reactiva automáticamente a `'activo'`**.
4. **Propagación en tiempo real:**
   - Emite `lote_extendido` a `admin:all`, `lote:activo` y `tv:global`.
   - Los paneles de los operadores desbloquean de inmediato el botón "Llamar Siguiente".
   - La TV pública vuelve a mostrar el próximo número en espera (el `#501`).
   - **Cero reinicios:** El proceso continúa de forma transparente sin perder el turno en curso ni desfasar contadores.

#### ¿Qué pasa si se pausa un lote al final del día?
- El admin pulsa "Pausar Lote". El lote queda en `estado = 'pausado'`, congelado exactamente en el último número llamado (ej. `#300`).
- Los operadores no pueden llamar más turnos.
- **Al día siguiente:** El admin presiona "Activar Lote" (`PATCH /lotes/:id/activar`). El lote retoma su estado `'activo'` y el siguiente operador que presione "Llamar Siguiente" recibirá el `#301`.

#### ¿Qué pasa si se cierra un lote definitivamente?
- Al pulsar "Cerrar Lote", el estado cambia irreversiblemente a `'cerrado'` (`fecha_cierre = NOW()`).
- Un lote cerrado **nunca más puede activarse ni extenderse**.
- El admin procede a presionar "Nuevo Lote" declarando `numero_desde = 1` y `numero_hasta = 500`.
- El sistema crea y auto-activa el **Lote N+1**.
- La numeración recomienza desde el `#1`, y las pantallas de TV y operadores se sincronizan para convocar nuevamente a partir del turno `#1`.

#### Ajuste Manual del Contador de Lote (Plan B de Contingencia)
Si hubo una caída eléctrica prolongada o corte general de red y el personal tuvo que atender 25 números en papel físico a mano:
- El admin utiliza `PATCH /lotes/:id/ajustar-contador`.
- Permite adelantar el contador (ej. del `#100` al `#125`) registrando obligatoriamente el motivo y la auditoría.
- Si se intentara retroceder el contador por debajo del máximo de turnos ya emitidos en base de datos, el backend lo bloquea para no generar duplicados en las ventanillas.

---

## 6. Pestaña 5: Reportes y Exportación

### 6.1 Filtros Disponibles
- **Fecha:** Selector de fecha (por defecto la fecha actual).
- **Mesa:** Dropdown con todas las mesas configuradas o "Todas las mesas".
- **Operador:** Dropdown con todos los operadores o "Todos los operadores".
- **Estado del Turno:** Selector para filtrar por "Todos", "Solo Atendidos" o "Solo Cancelados".

---

### 6.2 Datos Presentados en Pantalla
1. **Métricas Agregadas:** Total de turnos del día, total atendidos, total cancelados, tiempo promedio de atención y tiempo promedio de espera en auditorio (calculado como `llamado_en - creado_en`).
2. **Resumen por Mesa:** Tabla comparativa indicando cuántos turnos atendió cada mesa, su tiempo promedio y su porcentaje respecto a la jornada global.
3. **Detalle Individual de Turnos:** Tabla completa con número de turno, mesa, operador, origen (`voucher_fisico` o `kiosko_web`), hora de llamado, hora de finalización y duración exacta en segundos.

---

### 6.3 Semáforo de Exportación a Excel / XLS
- Para evitar que múltiples administradores o supervisores saturen la memoria RAM del servidor de base de datos descargando reportes pesados al mismo tiempo, el endpoint `/admin/reportes/exportar-xls` implementa un **semáforo de concurrencia estricto en memoria**:
  ```javascript
  if (fastify._reporteSemaforo >= 1) {
    return reply.status(429).header('Retry-After', '15').send({
      error: { codigo: 'reporte_en_proceso', mensaje: 'Ya hay un reporte generándose. Intente en unos segundos.' }
    });
  }
  ```
- Si otro administrador solicita la descarga simultánea, recibe un código **HTTP 429 Too Many Requests** solicitándole esperar 15 segundos.
- La exportación genera un archivo estructurado con formato XML Spreadsheet / XLS compatible con Microsoft Excel, LibreOffice Calc y Google Sheets con estilos visuales institucionales, cabeceras contrastadas y tablas agrupadas.

---

## 7. Pestaña 6: Configuración del Sistema (Ajustes en Caliente)

Permite ajustar parámetros de negocio que se guardan en la tabla `configuracion` y se difunden por WebSocket:

| Parámetro | Clave BD | Tipo | Efecto en Caliente |
|---|---|---|---|
| **Tiempo Máx. de Atención** | `tiempo_max_atencion_min` | Entero (min) | Actualiza el semáforo de Monitoreo (verde/amarillo/rojo). |
| **Alerta Vouchers Restantes** | `alerta_vouchers_restantes` | Entero | Dispara badge de advertencia cuando el lote está por agotarse. |
| **Modo de Generación de Turnos** | `modo_generacion_turnos` | `'voucher_fisico'` \| `'kiosko_web'` | Cambia el modelo operativo de la TV y habilita/inhabilita el Kiosko. |
| **Modalidad de Kiosko** | `kiosko_modo_uso` | `'asistido'` \| `'estudiante'` | Alterna entre Tablets en portón y Autoservicio móvil QR. |
| **Escala Principal TV** | `tv_escala_principal` | 75 a 140% | Cambia en vivo el tamaño del número gigante en la TV. |
| **Escala Secundaria TV** | `tv_escala_secundaria` | 75 a 140% | Cambia en vivo el tamaño del historial en la TV. |
| **Voz de Anuncios TV** | `voz_anuncio_activa` | Booleano | Silencia o activa la síntesis de voz en los televisores. |
| **Fondo Personalizado TV** | `fondo_imagen_url` | URL string | Aplica fondo institucional con control de escala y opacidades. |

---

## 8. Checklist de Validación y Control de Calidad

Antes de homologar cualquier actualización en la consola de administración:

- [ ] ¿Cero emojis presentes en títulos, botones, badges, modales y tablas (100% SVG vectoriales)?
- [ ] ¿El fondo general respeta `#EEF2F6` y los contenedores son blancos con borde `#CBD5E1`?
- [ ] ¿Los contadores de turnos, identificadores de mesa y cronómetros emplean `JetBrains Mono` tabular?
- [ ] ¿En Monitoreo se actualizan los KPIs y la tabla de mesas en vivo mediante el canal `admin:all` sin recargar?
- [ ] ¿Al pausar una mesa se visualiza claramente el motivo de pausa y el tiempo transcurrido?
- [ ] ¿Se impide la eliminación de una mesa si tiene un operador con turno en atención activo?
- [ ] ¿Se impide que un operador sea asignado a dos mesas en simultáneo?
- [ ] ¿Se bloquea la auto-eliminación del administrador conectado y la desactivación del último admin?
- [ ] ¿Al extender un lote agotado se reactiva a estado `'activo'` y se desbloquean los paneles de operador?
- [ ] ¿La exportación de reportes maneja semáforo concurrente para proteger el rendimiento del servidor?
