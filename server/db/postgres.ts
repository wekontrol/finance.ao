import { Pool } from 'pg';
import sqlitePool from './sqlite';

// PostgreSQL connection pool with SQLite fallback for development
let pool: any;

const isProd = process.env.NODE_ENV === 'production' && process.env.DATABASE_URL;

if (isProd) {
  // Production: Use PostgreSQL
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
  });
  pool.on('error', (err: any) => {
    console.error('❌ PostgreSQL error:', err);
  });
  console.log('✅ Using PostgreSQL connection pool (production)');
} else {
  // Development: Use SQLite pool
  pool = sqlitePool;
  console.log('🗄️  Using SQLite connection pool (development)');
}

// Create sessions table if it doesn't exist
export async function initializeSessionsTable() {
  try {
    if (isProd) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS session (
          sid varchar NOT NULL,
          sess json NOT NULL,
          expire timestamp(6) NOT NULL,
          PRIMARY KEY (sid)
        );
        CREATE INDEX IF NOT EXISTS IDX_session_expire ON session (expire);
      `);
      console.log('✅ PostgreSQL sessions table initialized');
    } else {
      // SQLite initializes tables automatically
      console.log('✅ SQLite sessions table ready');
    }
  } catch (error) {
    console.error('Error initializing sessions table:', error);
  }
}

export default pool;
