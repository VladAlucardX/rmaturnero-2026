'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

module.exports = async function runSeed() {
  const connectionString = process.env.DATABASE_URL ||
    `postgresql://${process.env.DB_USER || 'postgres'}:${encodeURIComponent(process.env.DB_PASSWORD || 'turnero')}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT_EXPOSED || process.env.PGBOUNCER_PORT_EXPOSED || '5432'}/${process.env.DB_NAME || 'turnero'}`;

  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  const COST = parseInt(process.env.BCRYPT_COST || '10', 10);

  try {
    const adminHash    = await bcrypt.hash('soporte',        COST);
    const admin2Hash   = await bcrypt.hash('soporte',       COST);
    const operadorHash = await bcrypt.hash('Operador2026!', COST);

    await client.query('BEGIN');

    // Insertar 2 Administradores
    await client.query(`
      INSERT INTO usuarios (username, nombre_completo, password_hash, rol, activo)
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT DO NOTHING
    `, ['admin', 'Administrador del Sistema', adminHash, 'admin']);

    await client.query(`
      INSERT INTO usuarios (username, nombre_completo, password_hash, rol, activo)
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT DO NOTHING
    `, ['admin2', 'Administrador de Soporte', admin2Hash, 'admin']);

    // Insertar 5 Operadores
    for (let i = 1; i <= 5; i++) {
      await client.query(`
        INSERT INTO usuarios (username, nombre_completo, password_hash, rol, activo)
        VALUES ($1, $2, $3, $4, true)
        ON CONFLICT DO NOTHING
      `, [`op${i}`, `Operador ${i}`, operadorHash, 'operador']);
    }

    // Insertar 10 Mesas
    for (let i = 1; i <= 10; i++) {
      await client.query(`
        INSERT INTO mesas (numero, nombre, estado, operador_id)
        VALUES ($1, $2, 'inactiva', NULL)
        ON CONFLICT DO NOTHING
      `, [i, `Mesa ${i}`]);
    }

    // Insertar Lote 1
    const { rows: loteExistente } = await client.query('SELECT id FROM lotes_voucher WHERE numero_lote = 1');
    if (loteExistente.length === 0) {
      await client.query(`
        INSERT INTO lotes_voucher (numero_lote, numero_desde, numero_hasta, ultimo_numero_llamado, estado, fecha_activacion)
        VALUES (1, 1, 500, 0, 'activo', NOW())
      `);
    }

    // Insertar Configuración v2.1
    const configuraciones = [
      ['tiempo_max_atencion_min',     '5',                                      'Tiempo maximo de atencion por mesa en minutos.'],
      ['tiempo_alerta_amarilla_min',   '4',                                      'Minutos para semaforo amarillo en panel.'],
      ['alerta_vouchers_restantes',    '20',                                     'Vouchers restantes para alerta.'],
      ['max_turnos_espera_kiosko',    '100',                                    'Capacidad maxima de turnos en espera.'],
      ['kiosko_web_activo',           'false',                                  'Activar Kiosko Web.'],
      ['impresion_automatica',        'false',                                  'Impresion automatica de tickets.'],
      ['anuncio_voz_activo',          'true',                                   'Sintesis de voz.'],
      ['anuncio_voz_repeticiones',    '2',                                      'Repeticiones de audio.'],
      ['modo_llamado_doble',          'false',                                  'Llamado doble en TV.'],
      ['zona_horaria',                'America/Tegucigalpa',                    'Zona horaria oficial.'],
      ['nombre_institucion',          'Universidad Nacional Autonoma',          'Nombre de la institucion.'],
      ['subtitulo_pantalla',          'Proceso de Matricula 2026',              'Subtitulo en TV.'],
      ['logo_url',                    '',                                       'URL del logo.'],
      ['color_primario_hex',          '#1D4ED8',                                'Color institucional principal.'],
      ['modo_generacion_turnos',      'voucher_fisico',                         'Modo operativo de turnos.'],
      ['duracion_voucher_min',        '60',                                     'Vigencia del turno.'],
      ['kiosko_tiempo_espera_seg',    '15',                                     'Timeout pantalla de exito kiosko.'],
      ['kiosko_qr_habilitado',        'true',                                   'Mostrar codigo QR.'],
      ['kiosko_url_publica',          '',                                       'URL publica kiosko.'],
      ['kiosko_modo_uso',             'asistido',                               'Modalidad asistido o estudiante.'],
      ['fondo_imagen_url',            '',                                       'URL imagen de fondo.'],
      ['fondo_imagen_activa',         'false',                                  'Activar fondo de imagen.'],
      ['fondo_imagen_escala',         '100',                                    'Escala fondo.'],
      ['tv_opacidad_principal',       '100',                                    'Opacidad tarjeta principal TV.'],
      ['tv_opacidad_secundaria',      '100',                                    'Opacidad tarjetas secundarias TV.']
    ];

    for (const [clave, valor, descripcion] of configuraciones) {
      await client.query(`
        INSERT INTO configuracion (clave, valor, descripcion, actualizado_en)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (clave) DO UPDATE
          SET valor          = EXCLUDED.valor,
              descripcion    = EXCLUDED.descripcion,
              actualizado_en = NOW()
      `, [clave, valor, descripcion]);
    }

    await client.query('COMMIT');
    console.log('[SEED] Datos iniciales y usuarios administradores creados exitosamente.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[SEED ERROR]', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};
