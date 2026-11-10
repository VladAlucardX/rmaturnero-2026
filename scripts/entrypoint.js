'use strict';

/**
 * Entrypoint de Producción para Docker / Coolify.
 * 1. Espera a que PostgreSQL / pgBouncer estén listos.
 * 2. Verifica si la base de datos contiene las tablas del sistema.
 * 3. Si la base de datos está vacía, aplica todas las migraciones SQL correlativamente (001..004).
 * 4. Ejecuta el seed inicial con usuarios admin y configuración v2.1.
 * 5. Inicia el servidor Fastify.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function waitForDbAndMigrate() {
  const connectionString = process.env.DATABASE_URL ||
    `postgresql://${process.env.DB_USER || 'postgres'}:${encodeURIComponent(process.env.DB_PASSWORD || 'turnero')}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT_EXPOSED || process.env.PGBOUNCER_PORT_EXPOSED || '5432'}/${process.env.DB_NAME || 'turnero'}`;

  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 5000
  });

  console.log('[ENTRYPOINT] Verificando conexión a la base de datos...');
  let client;
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      client = await pool.connect();
      await client.query('SELECT 1');
      console.log(`[ENTRYPOINT] Conectado exitosamente a PostgreSQL (intento ${attempt}).`);
      break;
    } catch (err) {
      if (attempt % 5 === 0) {
        console.log(`[ENTRYPOINT] Esperando base de datos (intento ${attempt}/30): ${err.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  if (!client) {
    console.error('[ENTRYPOINT FATAL] No se pudo conectar a PostgreSQL tras 30 intentos.');
    process.exit(1);
  }

  try {
    // Verificar si la tabla usuarios ya existe
    const tableCheck = await client.query(`
      SELECT to_regclass('public.usuarios') AS table_exists;
    `);

    const hasTables = !!tableCheck.rows[0].table_exists;

    if (!hasTables) {
      console.log('[ENTRYPOINT] Base de datos vacía detectada. Aplicando migraciones SQL...');
      const migrationsDir = path.join(__dirname, '../migrations');
      const sqlFiles = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

      for (const file of sqlFiles) {
        console.log(`[ENTRYPOINT] -> Ejecutando migración: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await client.query(sql);
      }
      console.log('[ENTRYPOINT] Migraciones completadas.');

      console.log('[ENTRYPOINT] Ejecutando seed inicial...');
      client.release();
      await pool.end();

      // Ejecutar seed con el script oficial
      await require('./seed_runner')();
      console.log('[ENTRYPOINT] Base de datos aprovisionada y lista.');
    } else {
      console.log('[ENTRYPOINT] Estructura de base de datos existente detectada. Omitiendo migraciones.');
      client.release();
      await pool.end();
    }
  } catch (err) {
    console.error('[ENTRYPOINT ERROR] Error durante la inicialización:', err);
    try { client.release(); } catch (_) {}
    try { await pool.end(); } catch (_) {}
  }

  // Iniciar servidor Fastify
  console.log('[ENTRYPOINT] Iniciando servidor Fastify...');
  require('../src/server');
}

waitForDbAndMigrate().catch(err => {
  console.error('[ENTRYPOINT FATAL]', err);
  process.exit(1);
});
