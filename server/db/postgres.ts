import { Pool } from 'pg';

// Simple mock pool for when no database is available
class MockPool {
  async query(sql: string, params?: any[]) {
    return { rows: [] };
  }
  release() {}
  connect() { return this; }
}

// PostgreSQL connection pool with fallback
let pool: any;

if (process.env.DATABASE_URL && process.env.NODE_ENV === 'production') {
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
} else {
  // Development/testing: use mock pool that returns empty results
  console.log('⚠️  Using mock database pool (development/testing)');
  pool = new MockPool();
}

// Create sessions table if it doesn't exist
export async function initializeSessionsTable() {
  try {
    if (process.env.NODE_ENV === 'production') {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS session (
          sid varchar NOT NULL,
          sess json NOT NULL,
          expire timestamp(6) NOT NULL,
          PRIMARY KEY (sid)
        );
        CREATE INDEX IF NOT EXISTS IDX_session_expire ON session (expire);
      `);
      
      // Verify table was created
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'session'
        );
      `);
      
      if (result.rows[0]?.exists) {
        console.log('✅ PostgreSQL sessions table initialized');
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      console.error('Error initializing sessions table:', error);
    }
  }
}

export default pool;
