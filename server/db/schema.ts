import { mysqlPoolRaw } from './index';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

export async function initializeDatabase() {
  try {
    // Create all tables for MySQL
    // MySQL syntax with maximum SQLite compatibility
    const connection = await mysqlPoolRaw.getConnection();
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS families (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        role TEXT NOT NULL DEFAULT 'MEMBER',
        avatar TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        created_by TEXT,
        family_id TEXT,
        birth_date TEXT,
        allow_parent_view INTEGER DEFAULT 0,
        security_question TEXT,
        security_answer TEXT,
        language_preference TEXT DEFAULT 'pt',
        currency_provider_preference TEXT DEFAULT 'BNA',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (family_id) REFERENCES families(id)
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT NOT NULL,
        category TEXT NOT NULL,
        type TEXT NOT NULL,
        is_recurring INTEGER DEFAULT 0,
        frequency TEXT,
        next_due_date TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS transaction_attachments (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL,
        name TEXT NOT NULL,
        size INTEGER,
        type TEXT,
        content TEXT,
        FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS savings_goals (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        target_amount REAL NOT NULL,
        current_amount REAL DEFAULT 0,
        deadline TEXT,
        color TEXT,
        interest_rate REAL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS goal_transactions (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        amount REAL NOT NULL,
        note TEXT,
        FOREIGN KEY (goal_id) REFERENCES savings_goals(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS budget_limits (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        category TEXT NOT NULL,
        limit_amount REAL NOT NULL,
        is_default INTEGER DEFAULT 0,
        translation_key TEXT,
        UNIQUE(user_id, category),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS budget_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        category TEXT NOT NULL,
        month TEXT NOT NULL,
        limit_amount REAL NOT NULL,
        spent_amount REAL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, category, month),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS family_tasks (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        description TEXT NOT NULL,
        assigned_to TEXT,
        is_completed INTEGER DEFAULT 0,
        due_date TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS family_events (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        type TEXT DEFAULT 'general',
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        read INTEGER DEFAULT 0,
        date TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS saved_simulations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        loan_amount REAL NOT NULL,
        interest_rate_annual REAL NOT NULL,
        term_months INTEGER NOT NULL,
        system TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS exchange_rates (
        provider TEXT PRIMARY KEY,
        rates TEXT NOT NULL,
        last_update TEXT DEFAULT CURRENT_TIMESTAMP,
        next_update TEXT
      );

      CREATE TABLE IF NOT EXISTS notification_preferences (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        is_global INTEGER DEFAULT 0,
        budget_alerts INTEGER DEFAULT 1,
        subscription_alerts INTEGER DEFAULT 1,
        financial_tips INTEGER DEFAULT 1,
        goal_progress INTEGER DEFAULT 1,
        email_notifications INTEGER DEFAULT 1,
        push_notifications INTEGER DEFAULT 1,
        UNIQUE(user_id, is_global),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS ai_analysis_cache (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        month TEXT NOT NULL,
        analysis_data TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT,
        UNIQUE(user_id, month),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        subscription TEXT NOT NULL,
        user_agent TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_active TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, subscription),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS forecast_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        predictions TEXT NOT NULL,
        confidence INTEGER DEFAULT 0,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS waste_analysis_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        waste_indicators TEXT NOT NULL,
        total_waste REAL DEFAULT 0,
        suggestions TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS api_configurations (
        id TEXT PRIMARY KEY,
        provider TEXT UNIQUE NOT NULL,
        api_key TEXT NOT NULL,
        model TEXT,
        is_default INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS translations (
        id TEXT PRIMARY KEY,
        language TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_by TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active',
        UNIQUE(language, key),
        FOREIGN KEY (created_by) REFERENCES users(id)
      );

      /* Performance Indexes */
      CREATE INDEX IF NOT EXISTS idx_users_family_id ON users(family_id);
      CREATE INDEX IF NOT EXISTS idx_users_created_by ON users(created_by);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
      CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
      CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
      CREATE INDEX IF NOT EXISTS idx_budget_limits_user_id ON budget_limits(user_id);
      CREATE INDEX IF NOT EXISTS idx_budget_limits_user_category ON budget_limits(user_id, category);
      CREATE INDEX IF NOT EXISTS idx_budget_history_user_id ON budget_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_goals_user_id ON savings_goals(user_id);
      CREATE INDEX IF NOT EXISTS idx_goal_transactions_goal_id ON goal_transactions(goal_id);
      CREATE INDEX IF NOT EXISTS idx_goal_transactions_user_id ON goal_transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_family_tasks_family_id ON family_tasks(family_id);
      CREATE INDEX IF NOT EXISTS idx_family_events_family_id ON family_events(family_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_forecast_history_user_id ON forecast_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_waste_analysis_user_id ON waste_analysis_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_saved_simulations_user_id ON saved_simulations(user_id);
      CREATE INDEX IF NOT EXISTS idx_transaction_attachments_transaction_id ON transaction_attachments(transaction_id);
      CREATE INDEX IF NOT EXISTS idx_translations_language_key ON translations(language, key);
    `);

    // Check if admin exists (skip in development with in-memory DB)
    if (process.env.NODE_ENV === 'production') {
      const adminResult = await pool.query('SELECT id FROM users WHERE username = $1', ['admin']);
      
      if (adminResult.rows.length === 0) {
        // First create the admin family
        await pool.query(
          `INSERT INTO families (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
          ['fam_admin', 'Admin Family']
        );
        
        const hashedPassword = bcrypt.hashSync('admin', 10);
        await pool.query(
          `INSERT INTO users (id, username, password, name, role, avatar, status, family_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          ['u0', 'admin', hashedPassword, 'Super Admin', 'SUPER_ADMIN', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Super', 'APPROVED', 'fam_admin']
        );
        console.log('✅ Admin user created');
      }
    }

    // Load translations from JSON files
    const translationsResult = await pool.query('SELECT COUNT(*) as count FROM translations');
    if (parseInt(translationsResult.rows[0]?.count || '0') === 0) {
      const localesDir = path.join(process.cwd(), 'public', 'locales');
      
      try {
        const files = fs.readdirSync(localesDir).filter(f => f.endsWith('.json'));
        const languages = files.map(f => f.replace('.json', ''));
        
        console.log(`📚 Found languages: ${languages.join(', ')}`);
        
        for (const lang of languages) {
          const filePath = path.join(localesDir, `${lang}.json`);
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            const translations = JSON.parse(content);
            
            for (const [key, value] of Object.entries(translations)) {
              const id = `tr${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
              try {
                await pool.query(
                  `INSERT INTO translations (id, language, key, value, created_by, status)
                   VALUES ($1, $2, $3, $4, $5, 'active')
                   ON CONFLICT DO NOTHING`,
                  [id, lang, key, String(value), 'u0']
                );
              } catch (e) {
                // Skip duplicates
              }
            }
          }
        }
        console.log('✅ Translations loaded from JSON files');
      } catch (error) {
        console.error('Failed to load translations:', error);
      }
    }

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}
