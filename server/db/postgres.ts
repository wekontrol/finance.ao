import { Pool } from 'pg';

// PostgreSQL connection pool
// In Replit development: Ignore DATABASE_URL to use memory store
// In production (Ubuntu/Render): DATABASE_URL is required
let pool: any;

// Force development mode in Replit (disable Neon endpoint)
const useRealDB = process.env.DATABASE_URL && process.env.NODE_ENV === 'production';

if (useRealDB) {
  // Production (Ubuntu, Render) OR Development with real DB
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
  });
  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
  });
  console.log('✅ Using PostgreSQL connection pool');
} else {
  // Development fallback - SIMPLE memory store
  class SimpleMemoryPool {
    async query(sql: string, params?: any[]) {
      // Return empty results - forces app to handle missing DB gracefully
      return { rows: [] };
    }
    release() {}
    connect() { return this; }
  }
  pool = new SimpleMemoryPool();
  console.log('⚠️  No DATABASE_URL - using memory pool (development only)');
}

// Create sessions table if it doesn't exist
export async function initializeSessionsTable() {
  try {
    if (!process.env.DATABASE_URL) {
      console.log('⚠️  Skipping session table init - no DATABASE_URL');
      return;
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS session (
        sid varchar NOT NULL,
        sess json NOT NULL,
        expire timestamp(6) NOT NULL,
        PRIMARY KEY (sid)
      );
      CREATE INDEX IF NOT EXISTS IDX_session_expire ON session (expire);
    `);

    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'session'
      );
    `);

    if (result.rows[0]?.exists) {
      console.log('✅ PostgreSQL sessions table initialized');
    }
  } catch (error) {
    console.error('Error initializing sessions table:', error);
  }
}

export default pool;
