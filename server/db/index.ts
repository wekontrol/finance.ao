/**
 * Database pool com suporte automático para PostgreSQL e SQLite
 */
import { Pool } from 'pg';
import { sqlitePool } from './sqlite';
import { createQueryWrapper } from './query-converter';

const isProd = process.env.NODE_ENV === 'production' && process.env.DATABASE_URL;

let pool: any;

if (isProd) {
  // Production: PostgreSQL
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
  });
  pool.on('error', (err: any) => {
    console.error('PostgreSQL error:', err);
  });
  console.log('✅ Database: PostgreSQL (production)');
} else {
  // Development: SQLite
  pool = sqlitePool;
  console.log('🗄️  Database: SQLite (development)');
}

// Exportar pool com wrapper inteligente
export default createQueryWrapper(pool);
export { pool as rawPool };
