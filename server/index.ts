import express from 'express';
import session from 'express-session';
import cors from 'cors';
import path from 'path';
import { initializeDatabase } from './db/schema';
import { initializeSessionsTable } from './db/mysql';
import dbPool from './db/index';
import { sqlitePool } from './db/sqlite';
import { mysqlPoolRaw } from './db/mysql';
import authRoutes from './routes/auth';
import transactionRoutes from './routes/transactions';
import goalRoutes from './routes/goals';
import userRoutes from './routes/users';
import familyRoutes from './routes/family';
import budgetRoutes, { startMonthlyHistoryScheduler } from './routes/budget';
import settingsRoutes from './routes/settings';
import familiesRoutes from './routes/families';
import backupRoutes from './routes/backup';
import systemRoutes from './routes/system';
import notificationRoutes from './routes/notifications';
import pushRoutes from './routes/push';
import emailRoutes from './routes/email';
import translationsRoutes from './routes/translations';
import reportsRoutes from './routes/reports';
import aiPlanningRoutes from './routes/aiPlanning';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Determine environment
const isProd = process.env.NODE_ENV === 'production' && process.env.DATABASE_URL;
console.log(`🔍 NODE_ENV=${process.env.NODE_ENV}, DATABASE_URL=${process.env.DATABASE_URL ? 'SET' : 'NOT SET'}`);
if (isProd) {
  console.log('✅ Production mode: Using MySQL');
} else {
  console.log('🗄️  Development mode: Using SQLite');
}

// Initialize database
(async () => {
  try {
    // Initialize SQLite in development
    if (!isProd) {
      await sqlitePool.init();
    }
    
    // Initialize in production
    if (isProd) {
      await initializeDatabase();
    }
    
    // Initialize sessions table
    await initializeSessionsTable();
    console.log('✅ Database initialization completed');
  } catch (error) {
    console.error('Database initialization error:', error);
    if (isProd) {
      process.exit(1);
    }
    // Development: non-critical
  }
})();

// CORS configuration - must be before session middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow all origins in development and production
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const sessionSecret = process.env.SESSION_SECRET || 'gestor-financeiro-secret-key-2024';

// Session store - MySQL in production, memory in development
let sessionStore: any = new (session.MemoryStore)();

if (isProd) {
  // Production: Use MySQL direct queries for sessions (simple, reliable)
  class MySQLSessionStore extends session.Store {
    async get(sid: string, callback: any) {
      try {
        const sql = `SELECT sess FROM session WHERE sid = ? AND expire > NOW()`;
        const [rows]: any = await mysqlPoolRaw.query(sql, [sid]);
        if (rows && rows.length > 0) {
          callback(null, JSON.parse(rows[0].sess));
        } else {
          callback(null, null);
        }
      } catch (err) {
        callback(err);
      }
    }

    async set(sid: string, session: any, callback: any) {
      try {
        const expire = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const sql = `INSERT INTO session (sid, sess, expire) VALUES (?, ?, ?) 
                     ON DUPLICATE KEY UPDATE sess = VALUES(sess), expire = VALUES(expire)`;
        await mysqlPoolRaw.query(sql, [sid, JSON.stringify(session), expire]);
        callback();
      } catch (err) {
        callback(err);
      }
    }

    async destroy(sid: string, callback: any) {
      try {
        const sql = `DELETE FROM session WHERE sid = ?`;
        await mysqlPoolRaw.query(sql, [sid]);
        callback();
      } catch (err) {
        callback(err);
      }
    }
  }

  sessionStore = new MySQLSessionStore();
  console.log('✅ Using MySQL session store (production - PERSISTENT)');
} else {
  // Development: Use memory store
  console.log('✅ Using memory session store (development mode)');
}

// Session middleware - must be before route handlers
app.use(session({
  store: sessionStore,
  secret: sessionSecret,
  resave: false, // Optimized for MySQL store
  saveUninitialized: false, // Only save initialized sessions
  cookie: {
    secure: false, // Disable for testing (enable with HTTPS in production)
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/'
  },
  proxy: true // Trust proxy for secure cookies
}));

// Prevent browser caching of API responses (dynamic data)
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/users', userRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/families', familiesRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/translations', translationsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/ai-planning', aiPlanningRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler - prevent crashes
app.use((err: any, req: any, res: any, next: any) => {
  console.error('❌ Server error:', err.message || err);
  
  // Database errors - return gracefully
  if (err.message?.includes('SQLITE_ERROR') || err.message?.includes('no such table')) {
    return res.status(503).json({ 
      error: 'Database temporarily unavailable',
      details: 'Please try again'
    });
  }
  
  // All other errors
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message
  });
});

// Production: serve static files from dist
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(process.cwd(), 'dist')));
  
  // SPA fallback route
  app.use((req, res) => {
    res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  if (process.env.NODE_ENV === 'production') {
    console.log('Running in production mode');
    console.log('✅ Sessions stored in MySQL (persistent)');
  } else {
    console.log('Running in development mode');
  }

  // Start budget history background scheduler
  startMonthlyHistoryScheduler();
});
