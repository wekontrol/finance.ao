import { Pool } from 'pg';

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // Reduced connection pool size for stability
  idleTimeoutMillis: 60000, // Increased idle timeout
  connectionTimeoutMillis: 10000, // Increased connection timeout
  statement_timeout: 30000, // Add statement timeout
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Create sessions table if it doesn't exist
export async function initializeSessionsTable() {
  try {
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
    
    if (result.rows[0].exists) {
      console.log('✅ PostgreSQL sessions table initialized');
    }
  } catch (error) {
    console.error('Error initializing sessions table:', error);
  }
}

export default pool;
