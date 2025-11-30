import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

// In-memory database for development (no PostgreSQL needed)
class InMemoryPool {
  private store: Record<string, any[]> = {
    users: [],
    families: [],
    transactions: [],
    categories: [],
    budgets: [],
    translations: [],
    notifications: [],
    session: [],
  };

  constructor() {
    // Initialize with admin user
    const adminFamily = { id: 'fam_admin', name: 'Admin Family' };
    this.store.families.push(adminFamily);

    const adminUser = {
      id: 'u0',
      username: 'admin',
      password: bcrypt.hashSync('admin', 10),
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Super',
      status: 'APPROVED',
      family_id: 'fam_admin',
      created_at: new Date(),
      email: 'admin@local',
    };
    this.store.users.push(adminUser);
    console.log('✅ In-memory DB initialized with admin user');
  }

  async query(sql: string, params?: any[]) {
    // Simple SQL parsing for basic queries
    const upperSql = sql.toUpperCase();

    if (upperSql.includes('SELECT COUNT(*) as count FROM translations')) {
      return { rows: [{ count: this.store.translations.length }] };
    }

    if (upperSql.includes('SELECT') && upperSql.includes('FROM users')) {
      if (upperSql.includes('WHERE username')) {
        const user = this.store.users.find((u: any) => u.username === params?.[0]);
        console.log(`[InMemory] Looking for user "${params?.[0]}" - Found: ${!!user}`);
        return { rows: user ? [user] : [] };
      }
      if (upperSql.includes('WHERE id')) {
        const user = this.store.users.find((u: any) => u.id === params?.[0]);
        return { rows: user ? [user] : [] };
      }
      return { rows: this.store.users };
    }

    if (upperSql.includes('SELECT') && upperSql.includes('FROM families')) {
      return { rows: this.store.families };
    }

    if (upperSql.includes('INSERT INTO users')) {
      const newUser = {
        id: params?.[0],
        username: params?.[1],
        password: params?.[2],
        name: params?.[3],
        role: params?.[4],
        avatar: params?.[5],
        status: params?.[6],
        family_id: params?.[7],
        created_at: new Date(),
      };
      this.store.users.push(newUser);
      return { rows: [newUser] };
    }

    if (upperSql.includes('INSERT INTO families')) {
      const newFamily = {
        id: params?.[0],
        name: params?.[1],
      };
      this.store.families.push(newFamily);
      return { rows: [newFamily] };
    }

    if (upperSql.includes('INSERT INTO translations')) {
      const translation = {
        id: params?.[0],
        language: params?.[1],
        key: params?.[2],
        value: params?.[3],
      };
      this.store.translations.push(translation);
      return { rows: [translation] };
    }

    if (upperSql.includes('CREATE TABLE') || upperSql.includes('CREATE INDEX')) {
      return { rows: [] };
    }

    if (upperSql.includes('SELECT EXISTS')) {
      return { rows: [{ exists: true }] };
    }

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
  // Development/testing: use in-memory pool
  console.log('⚠️  Using in-memory database (development/testing)');
  pool = new InMemoryPool();
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
