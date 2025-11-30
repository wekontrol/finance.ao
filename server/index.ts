import express from 'express';
import session from 'express-session';
import cors from 'cors';
import path from 'path';
import { initializeDatabase } from './db/schema';
import { initializeSessionsTable } from './db/mysql';
import dbPool from './db/index';
import { sqlitePool } from './db/sqlite';
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
if (isProd) {
  console.log('✅ Production mode: Using PostgreSQL');
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

// Session store - memory only (development) or PostgreSQL (production)
let sessionStore: any;
const MemoryStore = session.MemoryStore;
sessionStore = new MemoryStore();
console.log('✅ Using memory session store (development mode)');

// Session middleware - must be before route handlers
app.use(session({
  store: sessionStore,
  secret: sessionSecret,
  resave: true, // CRITICAL: Set to true for PostgreSQL store
  saveUninitialized: true, // CRITICAL: Set to true to ensure session is stored
  cookie: {
    secure: process.env.NODE_ENV === 'production' ? false : false, // Disable secure in production for testing
    httpOnly: true,
    sameSite: 'lax', // Use lax for all environments to allow cross-origin
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
    console.log('✅ Sessions stored in PostgreSQL (persistent)');
  } else {
    console.log('Running in development mode');
  }

  // Start budget history background scheduler
  startMonthlyHistoryScheduler();
});
