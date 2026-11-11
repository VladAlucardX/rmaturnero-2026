/**
 * ==============================================================================
 * IMPRESOR.JS — Controlador de Emisión e Impresión Térmica para Portón
 * Sistema Turnero de Matrículas 2026 (v2.1)
 *
 * Funcionalidad:
 *  - Emisión ágil de números con autoincremento para recepción de estudiantes.
 *  - Conexión directa Web Bluetooth a impresoras térmicas portátiles (PT-210).
 *  - Modo alternativo de Impresión del Sistema (Android / Navegador).
 *  - Reimpresión de tickets actuales, anteriores o números específicos.
 *  - Persistencia en localStorage para continuidad ante recargas.
 *
 * Cumple: RF-USA-04 (Cero emojis), Offline-First, LAN Resilient.
 * ==============================================================================
 */

import { WebBluetoothThermalPrinter, construirTicketCentroTecnologico } from '../escpos-printer.js';

document.addEventListener('alpine:init', () => {
  Alpine.data('impresorView', () => ({
    // Estado numérico
    numeroActual: 1,
    ultimoImpreso: null,
    totalEmitidos: 0,
    rangoInicio: 1,

    // Estado de hardware e impresión
    modoImpresion: 'bluetooth', // 'bluetooth' | 'sistema'
    bluetoothPrinter: null,
    bluetoothConectado: false,
    bluetoothDispositivoNombre: '',
    conectandoBluetooth: false,
    imprimiendo: false,

    // Detección de entorno
    esHttps: false,
    bluetoothDisponible: false,
    urlOrigenActual: '',

    // Modales y formularios
    modalAjustes: false,
    modalReimprimir: false,
    numeroAReimprimir: 1,
    modalEditarContador: false,
    nuevoNumeroInput: 1,

    // Notificaciones y reloj
    relojHora: '--:--:--',
    relojFecha: '--/--/----',
    _clockTimer: null,
    toast: {
      visible: false,
      mensaje: '',
      tipo: 'info',
      _timer: null
    },
    errorAjustes: '',

    async init() {
      // 1. Cargar estado persistente de localStorage
      try {
        const guardadoNum = localStorage.getItem('turnero_impresor_num');
        if (guardadoNum && !isNaN(parseInt(guardadoNum, 10))) {
          this.numeroActual = Math.max(1, parseInt(guardadoNum, 10));
        }

        const guardadoUltimo = localStorage.getItem('turnero_impresor_ultimo');
        if (guardadoUltimo && !isNaN(parseInt(guardadoUltimo, 10))) {
          this.ultimoImpreso = parseInt(guardadoUltimo, 10);
        }

        const guardadoTotal = localStorage.getItem('turnero_impresor_total');
        if (guardadoTotal && !isNaN(parseInt(guardadoTotal, 10))) {
          this.totalEmitidos = Math.max(0, parseInt(guardadoTotal, 10));
        }

        const guardadoModo = localStorage.getItem('turnero_impresor_modo');
        if (guardadoModo === 'sistema' || guardadoModo === 'bluetooth') {
          this.modoImpresion = guardadoModo;
        }

        const guardadoNombreBT = localStorage.getItem('turnero_impresor_bt_name');
        if (guardadoNombreBT) {
          this.bluetoothDispositivoNombre = guardadoNombreBT;
        }
      } catch (_) {}

      // 2. Detección de capacidades del navegador
      if (typeof window !== 'undefined') {
        this.esHttps = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        this.urlOrigenActual = window.location.origin;
        this.bluetoothDisponible = WebBluetoothThermalPrinter.isSupported();
        
        // Si no hay Bluetooth disponible o estamos en HTTP plano, sugerir modo sistema por defecto salvo que ya esté guardado
        if (!this.bluetoothDisponible && !localStorage.getItem('turnero_impresor_modo')) {
          this.modoImpresion = 'sistema';
        }
      }

      // 3. Inicializar reloj en vivo
      this._tickReloj();
      this._clockTimer = setInterval(() => this._tickReloj(), 1000);

      // 4. Inicializar cliente Web Bluetooth
      this.bluetoothPrinter = new WebBluetoothThermalPrinter({
        onConnected: (dev) => {
          this.bluetoothConectado = true;
          this.bluetoothDispositivoNombre = dev?.name || 'PT-210';
          this.mostrarToast(`Impresora conectada: ${this.bluetoothDispositivoNombre}`, 'success');
        },
        onDisconnected: () => {
          this.bluetoothConectado = false;
          this.mostrarToast('Impresora Bluetooth desconectada', 'warning');
        }
      });

      // Intentar reconectar si ya se había vinculado antes
      if (this.modoImpresion === 'bluetooth' && this.bluetoothDisponible) {
        this.bluetoothPrinter.reconectarSilencioso().catch(() => {});
      }
    },

    destroy() {
      if (this._clockTimer) clearInterval(this._clockTimer);
      if (this.bluetoothPrinter) {
        this.bluetoothPrinter.desconectar();
      }
    },

    _tickReloj() {
      const ahora = new Date();
      this.relojHora = ahora.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      this.relojFecha = ahora.toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric' });
    },

    formatoNumero(num) {
      const n = parseInt(num, 10);
      if (isNaN(n)) return '#001';
      return `#${String(n).padStart(3, '0')}`;
    },

    mostrarToast(mensaje, tipo = 'info') {
      if (this.toast._timer) clearTimeout(this.toast._timer);
      this.toast.mensaje = mensaje;
      this.toast.tipo = tipo;
      this.toast.visible = true;
      this.toast._timer = setTimeout(() => {
        this.toast.visible = false;
      }, 3500);
    },

    // ── ACCIÓN PRINCIPAL: IMPRIMIR SIGUIENTE ──────────────────────────────────
    async imprimirSiguiente() {
      if (this.imprimiendo) return;
      this.imprimiendo = true;

      const numAImprimir = this.numeroActual;
      try {
        await this._ejecutarImpresion(numAImprimir);

        // Actualizar contadores y avanzar al siguiente número
        this.ultimoImpreso = numAImprimir;
        this.numeroActual++;
        this.totalEmitidos++;

        this._guardarEstado();
        this._vibrarExito();
        this.mostrarToast(`Turno ${this.formatoNumero(numAImprimir)} impreso con éxito`, 'success');
      } catch (err) {
        this.mostrarToast(`Error al imprimir: ${err.message}`, 'error');
      } finally {
        this.imprimiendo = false;
      }
    },

    // ── REIMPRIMIR ACTUAL ─────────────────────────────────────────────────────
    async reimprimirActual() {
      if (this.imprimiendo) return;
      this.imprimiendo = true;

      const numAImprimir = this.numeroActual;
      try {
        await this._ejecutarImpresion(numAImprimir);
        this._vibrarExito();
        this.mostrarToast(`Reimpreso turno actual ${this.formatoNumero(numAImprimir)}`, 'info');
      } catch (err) {
        this.mostrarToast(`Error al reimprimir: ${err.message}`, 'error');
      } finally {
        this.imprimiendo = false;
      }
    },

    // ── REIMPRIMIR ANTERIOR ───────────────────────────────────────────────────
    async reimprimirAnterior() {
      if (!this.ultimoImpreso) {
        this.mostrarToast('Aún no se ha impreso ningún turno anterior', 'warning');
        return;
      }
      if (this.imprimiendo) return;
      this.imprimiendo = true;

      try {
        await this._ejecutarImpresion(this.ultimoImpreso);
        this._vibrarExito();
        this.mostrarToast(`Reimpreso turno anterior ${this.formatoNumero(this.ultimoImpreso)}`, 'info');
      } catch (err) {
        this.mostrarToast(`Error al reimprimir: ${err.message}`, 'error');
      } finally {
        this.imprimiendo = false;
      }
    },

    // ── REIMPRIMIR NÚMERO ESPECÍFICO ──────────────────────────────────────────
    abrirModalReimprimir() {
      this.numeroAReimprimir = this.ultimoImpreso || this.numeroActual;
      this.modalReimprimir = true;
    },

    cerrarModalReimprimir() {
      this.modalReimprimir = false;
    },

    async confirmarReimpresion() {
      const num = parseInt(this.numeroAReimprimir, 10);
      if (isNaN(num) || num < 1) {
        this.mostrarToast('Ingrese un número de turno válido mayor a 0', 'warning');
        return;
      }

      this.cerrarModalReimprimir();
      if (this.imprimiendo) return;
      this.imprimiendo = true;

      try {
        await this._ejecutarImpresion(num);
        this._vibrarExito();
        this.mostrarToast(`Reimpreso turno específico ${this.formatoNumero(num)}`, 'info');
      } catch (err) {
        this.mostrarToast(`Error al reimprimir: ${err.message}`, 'error');
      } finally {
        this.imprimiendo = false;
      }
    },

    // ── EDICIÓN MANUAL DEL CONTADOR ──────────────────────────────────────────
    ajustarContador(delta) {
      const nuevo = this.numeroActual + delta;
      if (nuevo < 1) return;
      this.numeroActual = nuevo;
      this._guardarEstado();
    },

    abrirModalEditarContador() {
      this.nuevoNumeroInput = this.numeroActual;
      this.modalEditarContador = true;
    },

    cerrarModalEditarContador() {
      this.modalEditarContador = false;
    },

    guardarNuevoNumeroContador() {
      const nuevo = parseInt(this.nuevoNumeroInput, 10);
      if (isNaN(nuevo) || nuevo < 1) {
        this.mostrarToast('Ingrese un número inicial válido mayor o igual a 1', 'warning');
        return;
      }
      this.numeroActual = nuevo;
      this._guardarEstado();
      this.cerrarModalEditarContador();
      this.mostrarToast(`Contador ajustado al turno ${this.formatoNumero(nuevo)}`, 'info');
    },

    reiniciarJornada() {
      if (confirm('¿Desea reiniciar el contador al turno #001? (El historial de hoy se conservará)')) {
        this.numeroActual = 1;
        this._guardarEstado();
        this.mostrarToast('Contador reiniciado a #001', 'info');
      }
    },

    // ── MOTOR DE IMPRESIÓN (BLUETOOTH ESC/POS O SISTEMA) ─────────────────────
    async _ejecutarImpresion(numero) {
      if (this.modoImpresion === 'bluetooth') {
        // Validación de disponibilidad Bluetooth
        if (!this.bluetoothDisponible) {
          throw new Error('Web Bluetooth no está disponible en este navegador. Utilice Google Chrome o cambie al modo "Impresión del Sistema".');
        }

        if (!this.bluetoothPrinter || !this.bluetoothPrinter.isConnected()) {
          // Intentar conectar automáticamente abriendo el diálogo
          this.mostrarToast('Conectando con impresora Bluetooth PT-210...', 'info');
          await this.conectarBluetooth();
        }

        // Construir binario ESC/POS nativo
        const bytes = construirTicketCentroTecnologico(numero, {
          fecha: this.relojFecha,
          hora: this.relojHora
        });

        // Enviar a la impresora térmica
        await this.bluetoothPrinter.imprimir(bytes);

      } else {
        // Modo Sistema: Actualizar DOM del área de impresión y llamar a window.print()
        this._actualizarAreaImpresionSistema(numero);
        await new Promise(r => setTimeout(r, 100)); // Esperar renderizado del DOM
        window.print();
      }
    },

    _actualizarAreaImpresionSistema(numero) {
      const elNum = document.getElementById('print-ticket-numero');
      const elFecha = document.getElementById('print-ticket-fecha');
      if (elNum) elNum.textContent = this.formatoNumero(numero);
      if (elFecha) elFecha.textContent = `${this.relojFecha}  ${this.relojHora}`;
    },

    // ── GESTIÓN DE BLUETOOTH ─────────────────────────────────────────────────
    async conectarBluetooth() {
      this.conectandoBluetooth = true;
      this.errorAjustes = '';
      try {
        await this.bluetoothPrinter.conectar();
        this.modoImpresion = 'bluetooth';
        localStorage.setItem('turnero_impresor_modo', 'bluetooth');
      } catch (err) {
        if (err.name !== 'NotFoundError') {
          this.errorAjustes = err.message || 'No se pudo vincular la impresora Bluetooth.';
          throw err;
        }
      } finally {
        this.conectandoBluetooth = false;
      }
    },

    desconectarBluetooth() {
      if (this.bluetoothPrinter) {
        this.bluetoothPrinter.desconectar();
      }
      this.bluetoothConectado = false;
      this.bluetoothDispositivoNombre = '';
      try {
        localStorage.removeItem('turnero_impresor_bt_name');
      } catch (_) {}
      this.mostrarToast('Impresora Bluetooth desvinculada', 'info');
    },

    async imprimirTicketPrueba() {
      try {
        await this._ejecutarImpresion('000');
        this.mostrarToast('Ticket de prueba enviado correctamente', 'success');
      } catch (err) {
        this.errorAjustes = err.message || 'Error al imprimir ticket de prueba';
        this.mostrarToast(`Fallo en ticket de prueba: ${err.message}`, 'error');
      }
    },

    cambiarModoImpresion(modo) {
      this.modoImpresion = modo;
      try {
        localStorage.setItem('turnero_impresor_modo', modo);
      } catch (_) {}
      this.mostrarToast(`Modo cambiado a: ${modo === 'bluetooth' ? 'Bluetooth Directo (PT-210)' : 'Impresión del Sistema'}`, 'info');
    },

    _guardarEstado() {
      try {
        localStorage.setItem('turnero_impresor_num', String(this.numeroActual));
        if (this.ultimoImpreso !== null) {
          localStorage.setItem('turnero_impresor_ultimo', String(this.ultimoImpreso));
        }
        localStorage.setItem('turnero_impresor_total', String(this.totalEmitidos));
      } catch (_) {}
    },

    _vibrarExito() {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([35, 25, 35]);
      }
    },

    async copiarTexto(texto) {
      try {
        await navigator.clipboard.writeText(texto);
        this.mostrarToast('Texto copiado al portapapeles', 'success');
      } catch (_) {
        this.mostrarToast('Seleccione y copie el texto manualmente', 'info');
      }
    }
  }));
});

