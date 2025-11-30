import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

export async function initializeDatabase() {
  try {
    // Check environment
    const isProd = process.env.NODE_ENV === 'production';
    const dbUrl = process.env.DATABASE_URL;
    
    console.log(`📊 Schema init: NODE_ENV=${process.env.NODE_ENV}, DATABASE_URL=${dbUrl ? 'SET' : 'NOT SET'}`);
    
    if (!isProd || !dbUrl) {
      console.log('ℹ️  Skipping schema initialization (not production or no DATABASE_URL)');
      return;
    }

    // Create MySQL pool directly for this operation
    const url = new URL(dbUrl);
    const pool = mysql.createPool({
      host: url.hostname,
      user: url.username,
      password: url.password,
      database: url.pathname.substring(1),
      port: parseInt(url.port || '3306'),
      waitForConnections: true,
      connectionLimit: 1,
      queueLimit: 0,
    });

    // Get connection
    const connection = await pool.getConnection();
    
    // Execute each CREATE TABLE separately (MySQL doesn't like multiple statements in one query)
    const tables = [
      `CREATE TABLE IF NOT EXISTS families (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        role VARCHAR(50) NOT NULL DEFAULT 'MEMBER',
        avatar VARCHAR(500),
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        created_by VARCHAR(255),
        family_id VARCHAR(255),
        birth_date VARCHAR(50),
        allow_parent_view TINYINT DEFAULT 0,
        security_question VARCHAR(255),
        security_answer VARCHAR(255),
        language_preference VARCHAR(10) DEFAULT 'pt',
        currency_provider_preference VARCHAR(50) DEFAULT 'BNA',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (family_id) REFERENCES families(id)
      )`,

      `CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        description VARCHAR(500) NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        date VARCHAR(50) NOT NULL,
        category VARCHAR(100) NOT NULL,
        type VARCHAR(50) NOT NULL,
        is_recurring TINYINT DEFAULT 0,
        frequency VARCHAR(50),
        next_due_date VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      `CREATE TABLE IF NOT EXISTS transaction_attachments (
        id VARCHAR(255) PRIMARY KEY,
        transaction_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        size INT,
        type VARCHAR(50),
        content LONGTEXT,
        FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS savings_goals (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        target_amount DECIMAL(15,2) NOT NULL,
        current_amount DECIMAL(15,2) DEFAULT 0,
        deadline VARCHAR(50),
        color VARCHAR(50),
        interest_rate DECIMAL(8,4),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      `CREATE TABLE IF NOT EXISTS goal_transactions (
        id VARCHAR(255) PRIMARY KEY,
        goal_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        date VARCHAR(50) NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        note VARCHAR(500),
        FOREIGN KEY (goal_id) REFERENCES savings_goals(id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS budget_limits (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        limit_amount DECIMAL(15,2) NOT NULL,
        is_default TINYINT DEFAULT 0,
        translation_key VARCHAR(255),
        UNIQUE(user_id, category),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      `CREATE TABLE IF NOT EXISTS budget_history (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        month VARCHAR(50) NOT NULL,
        limit_amount DECIMAL(15,2) NOT NULL,
        spent_amount DECIMAL(15,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, category, month),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      `CREATE TABLE IF NOT EXISTS family_tasks (
        id VARCHAR(255) PRIMARY KEY,
        family_id VARCHAR(255) NOT NULL,
        description VARCHAR(500) NOT NULL,
        assigned_to VARCHAR(255),
        is_completed TINYINT DEFAULT 0,
        due_date VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS family_events (
        id VARCHAR(255) PRIMARY KEY,
        family_id VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        date VARCHAR(50) NOT NULL,
        type VARCHAR(50) DEFAULT 'general',
        description VARCHAR(1000),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message VARCHAR(1000) NOT NULL,
        read TINYINT DEFAULT 0,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      `CREATE TABLE IF NOT EXISTS saved_simulations (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        loan_amount DECIMAL(15,2) NOT NULL,
        interest_rate_annual DECIMAL(8,4) NOT NULL,
        term_months INT NOT NULL,
        system VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      `CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(255) PRIMARY KEY,
        value LONGTEXT
      )`,

      `CREATE TABLE IF NOT EXISTS exchange_rates (
        provider VARCHAR(255) PRIMARY KEY,
        rates LONGTEXT NOT NULL,
        last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        next_update VARCHAR(50)
      )`,

      `CREATE TABLE IF NOT EXISTS notification_preferences (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255),
        is_global TINYINT DEFAULT 0,
        budget_alerts TINYINT DEFAULT 1,
        subscription_alerts TINYINT DEFAULT 1,
        financial_tips TINYINT DEFAULT 1,
        goal_progress TINYINT DEFAULT 1,
        email_notifications TINYINT DEFAULT 1,
        push_notifications TINYINT DEFAULT 1,
        UNIQUE(user_id, is_global),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      `CREATE TABLE IF NOT EXISTS ai_analysis_cache (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        month VARCHAR(50) NOT NULL,
        analysis_data LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at VARCHAR(50),
        UNIQUE(user_id, month),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS push_subscriptions (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        subscription LONGTEXT NOT NULL,
        user_agent VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, subscription(100)),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      `CREATE TABLE IF NOT EXISTS forecast_history (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        predictions LONGTEXT NOT NULL,
        confidence INT DEFAULT 0,
        notes VARCHAR(1000),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      `CREATE TABLE IF NOT EXISTS waste_analysis_history (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        waste_indicators LONGTEXT NOT NULL,
        total_waste DECIMAL(15,2) DEFAULT 0,
        suggestions LONGTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      `CREATE TABLE IF NOT EXISTS api_configurations (
        id VARCHAR(255) PRIMARY KEY,
        provider VARCHAR(255) UNIQUE NOT NULL,
        api_key VARCHAR(500) NOT NULL,
        model VARCHAR(255),
        is_default TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS translations (
        id VARCHAR(255) PRIMARY KEY,
        language VARCHAR(10) NOT NULL,
        key VARCHAR(255) NOT NULL,
        value LONGTEXT NOT NULL,
        created_by VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'active',
        UNIQUE(language, key),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )`
    ];

    // Create all tables
    for (const tableQuery of tables) {
      try {
        await connection.query(tableQuery);
      } catch (err: any) {
        // Table already exists is OK
        if (!err.message.includes('already exists')) {
          console.warn(`⚠️ Table creation warning:`, err.message);
        }
      }
    }

    // Create indexes (MySQL 5.7.2+ supports CREATE INDEX IF NOT EXISTS)
    const indexes = [
      `CREATE INDEX idx_users_family_id ON users(family_id)`,
      `CREATE INDEX idx_users_created_by ON users(created_by)`,
      `CREATE INDEX idx_users_username ON users(username)`,
      `CREATE INDEX idx_transactions_user_id ON transactions(user_id)`,
      `CREATE INDEX idx_transactions_date ON transactions(date)`,
      `CREATE INDEX idx_transactions_category ON transactions(category)`,
      `CREATE INDEX idx_transactions_user_date ON transactions(user_id, date)`,
      `CREATE INDEX idx_budget_limits_user_id ON budget_limits(user_id)`,
      `CREATE INDEX idx_budget_limits_user_category ON budget_limits(user_id, category)`,
      `CREATE INDEX idx_budget_history_user_id ON budget_history(user_id)`,
      `CREATE INDEX idx_goals_user_id ON savings_goals(user_id)`,
      `CREATE INDEX idx_goal_transactions_goal_id ON goal_transactions(goal_id)`,
      `CREATE INDEX idx_goal_transactions_user_id ON goal_transactions(user_id)`,
      `CREATE INDEX idx_family_tasks_family_id ON family_tasks(family_id)`,
      `CREATE INDEX idx_family_events_family_id ON family_events(family_id)`,
      `CREATE INDEX idx_notifications_user_id ON notifications(user_id)`,
      `CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id)`,
      `CREATE INDEX idx_forecast_history_user_id ON forecast_history(user_id)`,
      `CREATE INDEX idx_waste_analysis_user_id ON waste_analysis_history(user_id)`,
      `CREATE INDEX idx_saved_simulations_user_id ON saved_simulations(user_id)`,
      `CREATE INDEX idx_transaction_attachments_transaction_id ON transaction_attachments(transaction_id)`,
      `CREATE INDEX idx_translations_language_key ON translations(language, key)`
    ];

    for (const indexQuery of indexes) {
      try {
        await connection.query(indexQuery);
      } catch (err: any) {
        // Index already exists is OK
        if (!err.message.includes('already exists') && !err.message.includes('Duplicate key')) {
          // Silently ignore - index might already exist
        }
      }
    }

    // Check if admin exists (skip in development with in-memory DB)
    if (process.env.NODE_ENV === 'production') {
      const [adminResult] = await pool.query('SELECT id FROM users WHERE username = ?', ['admin']);
      
      if ((adminResult as any).length === 0) {
        // First create the admin family
        await pool.query(
          `INSERT INTO families (id, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE id=id`,
          ['fam_admin', 'Admin Family']
        );
        
        const hashedPassword = bcrypt.hashSync('admin', 10);
        await pool.query(
          `INSERT INTO users (id, username, password, name, role, avatar, status, family_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ['u0', 'admin', hashedPassword, 'Super Admin', 'SUPER_ADMIN', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Super', 'APPROVED', 'fam_admin']
        );
        console.log('✅ Admin user created');
      }
    }

    // Add status column to translations if it doesn't exist (migration for old DBs)
    try {
      const [tableInfo] = await pool.query("DESCRIBE translations");
      const hasStatusColumn = (Array.isArray(tableInfo) && tableInfo.some((col: any) => col.Field === 'status'));
      
      if (!hasStatusColumn) {
        await pool.query('ALTER TABLE translations ADD COLUMN status VARCHAR(50) DEFAULT "active"');
        console.log('✅ Added status column to translations');
      }
    } catch (err: any) {
      // Continue even if migration fails - status column might already exist
    }

    // Load translations from JSON files
    const [translationsResult] = await pool.query('SELECT COUNT(*) as count FROM translations');
    if (parseInt((translationsResult as any)[0]?.count || '0') === 0) {
      const localesDir = path.join(process.cwd(), 'dist', 'locales');
      
      try {
        if (fs.existsSync(localesDir)) {
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
                     VALUES (?, ?, ?, ?, ?, 'active')
                     ON DUPLICATE KEY UPDATE id=id`,
                    [id, lang, key, String(value), 'u0']
                  );
                } catch (e) {
                  // Skip duplicates
                }
              }
            }
          }
          console.log('✅ Translations loaded from JSON files');
        }
      } catch (error) {
        console.error('Failed to load translations:', error);
      }
    }

    connection.release();
    await pool.end();
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}
