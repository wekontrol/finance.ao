import Database from 'sqlite3';
import * as path from 'path';

const dbPath = path.join(process.cwd(), 'gestor_financeiro.db');

// SQLite database connection for development
class SQLitePool {
  private db: any;
  private initialized = false;

  async init() {
    if (this.initialized) return Promise.resolve();
    
    return new Promise((resolve, reject) => {
      this.db = new Database.Database(dbPath, async (err: any) => {
        if (err) {
          console.error('❌ SQLite connection error:', err);
          reject(err);
          return;
        }

        try {
          await this.createTables();
          this.initialized = true;
          console.log(`✅ SQLite initialized: ${dbPath}`);
          resolve(null);
        } catch (tableErr) {
          reject(tableErr);
        }
      });
    });
  }

  private async createTables() {
    const statements = [
      `CREATE TABLE IF NOT EXISTS families (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        role VARCHAR(50) DEFAULT 'USER',
        avatar TEXT,
        status VARCHAR(50) DEFAULT 'PENDING',
        family_id VARCHAR(255) REFERENCES families(id),
        created_by VARCHAR(255),
        birth_date DATE,
        allow_parent_view BOOLEAN DEFAULT 0,
        security_question TEXT,
        security_answer VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        description TEXT NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        type VARCHAR(10) CHECK(type IN ('income', 'expense')),
        category VARCHAR(255),
        date DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )`,

      `CREATE TABLE IF NOT EXISTS budget_limits (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        category VARCHAR(255) NOT NULL,
        limit_amount DECIMAL(10, 2),
        is_default BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS goals (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        name VARCHAR(255) NOT NULL,
        target_amount DECIMAL(10, 2),
        current_amount DECIMAL(10, 2) DEFAULT 0,
        deadline DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS session (
        sid VARCHAR(255) PRIMARY KEY,
        sess TEXT NOT NULL,
        expire DATETIME NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS savings_goals (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        name VARCHAR(255) NOT NULL,
        target_amount DECIMAL(10, 2),
        current_amount DECIMAL(10, 2) DEFAULT 0,
        deadline DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS goal_transactions (
        id VARCHAR(255) PRIMARY KEY,
        goal_id VARCHAR(255) NOT NULL REFERENCES savings_goals(id),
        amount DECIMAL(10, 2),
        date DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS budget_monthly_history (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        month VARCHAR(7),
        category VARCHAR(255),
        spent DECIMAL(10, 2) DEFAULT 0,
        limit_amount DECIMAL(10, 2),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS family_tasks (
        id VARCHAR(255) PRIMARY KEY,
        family_id VARCHAR(255) NOT NULL REFERENCES families(id),
        title VARCHAR(255),
        description TEXT,
        assigned_to VARCHAR(255),
        status VARCHAR(50) DEFAULT 'PENDING',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        title VARCHAR(255),
        message TEXT,
        type VARCHAR(50),
        read BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS push_subscriptions (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        subscription TEXT,
        last_active DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS translations (
        id VARCHAR(255) PRIMARY KEY,
        language VARCHAR(10),
        key VARCHAR(255),
        value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS ai_analysis_cache (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id),
        month VARCHAR(7),
        analysis_data TEXT,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date)`,
      `CREATE INDEX IF NOT EXISTS idx_budget_user_category ON budget_limits(user_id, category)`,
      `CREATE INDEX IF NOT EXISTS idx_session_expire ON session(expire)`,
      `CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key)`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_translations_lang_key ON translations(language, key)`,
      `CREATE INDEX IF NOT EXISTS idx_ai_cache_user_month ON ai_analysis_cache(user_id, month)`
    ];

    return new Promise((resolve, reject) => {
      const run = (index: number) => {
        if (index >= statements.length) {
          resolve(null);
          return;
        }

        this.db.run(statements[index], (err: any) => {
          if (err) {
            console.error(`SQLite schema creation error at statement ${index}:`, err);
            reject(err);
          } else {
            run(index + 1);
          }
        });
      };

      run(0);
    });
  }

  async query(sql: string, params: any[] = []) {
    if (!this.db || !this.initialized) {
      throw new Error('SQLite not initialized');
    }

    return new Promise((resolve, reject) => {
      const method = sql.trim().toUpperCase().startsWith('SELECT') ? 'all' : 'run';

      if (method === 'all') {
        this.db.all(sql, params, (err: any, rows: any) => {
          if (err) reject(err);
          else resolve({ rows: rows || [] });
        });
      } else {
        this.db.run(sql, params, function(err: any) {
          if (err) reject(err);
          else resolve({ rows: [], changes: this.changes });
        });
      }
    });
  }

  async close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err: any) => {
          if (err) reject(err);
          else resolve(null);
        });
      } else {
        resolve(null);
      }
    });
  }

  release() {
    // SQLite doesn't need connection release
  }

  connect() {
    return this;
  }
}

export const sqlitePool = new SQLitePool();
export default sqlitePool;
