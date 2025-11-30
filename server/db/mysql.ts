import mysql from 'mysql2/promise';
import { sqlitePool } from './sqlite';

const isProd = process.env.NODE_ENV === 'production' && process.env.DATABASE_URL;

let pool: any;

if (isProd) {
  // Production: MySQL from DATABASE_URL
  const url = new URL(process.env.DATABASE_URL!);
  pool = mysql.createPool({
    host: url.hostname,
    user: url.username,
    password: url.password,
    database: url.pathname.substring(1),
    port: parseInt(url.port || '3306'),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });
  console.log('✅ Using MySQL connection pool (production)');
} else {
  // Development: SQLite (via sqlite module)
  pool = sqlitePool;
  console.log('🗄️  Using SQLite connection pool (development)');
}

export async function initializeSessionsTable() {
  try {
    if (isProd) {
      const connection = await pool.getConnection();
      await connection.query(`
        CREATE TABLE IF NOT EXISTS session (
          sid VARCHAR(255) PRIMARY KEY,
          sess JSON NOT NULL,
          expire DATETIME NOT NULL,
          INDEX idx_expire (expire)
        )
      `);
      connection.release();
      console.log('✅ MySQL sessions table initialized');
    } else {
      console.log('✅ SQLite sessions table ready');
    }
  } catch (error) {
    console.error('Error initializing sessions table:', error);
  }
}

export default pool;
