import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import pgPool from '../db/postgres';

const router = Router();

// Progress tracking
let backupProgress = { current: 0, total: 100, status: 'idle' };

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function requireAdmin(req: Request, res: Response, next: Function) {
  if (!req.session.user || (req.session.user.role !== 'ADMIN' && req.session.user.role !== 'SUPER_ADMIN')) {
    return res.status(403).json({ error: 'Only admins can manage backups' });
  }
  next();
}

// GET backup progress
router.get('/progress', requireAuth, requireAdmin, (req: Request, res: Response) => {
  res.json(backupProgress);
});

// POST - Create backup
router.post('/', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    backupProgress = { current: 10, total: 100, status: 'Inicializando...' };

    backupProgress = { current: 30, total: 100, status: 'Lendo banco de dados...' };

    backupProgress = { current: 70, total: 100, status: 'Exportando dados...' };

    // Get all tables data from PostgreSQL
    const tables: Record<string, any[]> = {};
    const tableNamesResult = await pgPool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    );
    const tableNames = tableNamesResult.rows;
    
    for (const t of tableNames) {
      const tableName = t.table_name;
      const dataResult = await pgPool.query(`SELECT * FROM "${tableName}"`);
      tables[tableName] = dataResult.rows;
    }

    backupProgress = { current: 85, total: 100, status: 'Preparando arquivo...' };

    const backupData = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      tables,
      dbHash: crypto.createHash('md5').update(JSON.stringify(tables)).digest('hex')
    };

    backupProgress = { current: 100, total: 100, status: 'Completo!' };

    res.json({
      success: true,
      data: backupData,
      size: JSON.stringify(backupData).length,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    backupProgress = { current: 0, total: 100, status: 'Erro: ' + error.message };
    res.status(500).json({ error: error.message });
  }
});

// POST - Restore backup
router.post('/restore', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const client = await pgPool.connect();
  
  try {
    const { backupData } = req.body;

    if (!backupData || !backupData.tables) {
      client.release();
      return res.status(400).json({ error: 'Invalid backup data' });
    }

    backupProgress = { current: 10, total: 100, status: 'Iniciando restauro...' };

    // Start transaction
    await client.query('BEGIN');

    // Get all existing tables
    const tableNamesResult = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name NOT LIKE 'pg_%'"
    );
    const tableNames = tableNamesResult.rows;
    
    backupProgress = { current: 20, total: 100, status: 'Limpando banco de dados...' };
    
    // Clear all existing tables
    for (const t of tableNames) {
      try {
        await client.query(`DELETE FROM "${t.table_name}"`);
      } catch (e) {
        // Table might not exist or have constraints
      }
    }

    backupProgress = { current: 40, total: 100, status: 'Inserindo dados...' };

    // Restore data table by table
    const tableList = Object.keys(backupData.tables);
    let processed = 0;

    for (const tableName of tableList) {
      const rows = backupData.tables[tableName];
      if (rows && rows.length > 0) {
        const firstRow = rows[0];
        const columns = Object.keys(firstRow);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
        const sql = `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`;
        
        for (const row of rows) {
          const values = columns.map(col => row[col]);
          await client.query(sql, values);
        }
      }
      
      processed++;
      const progress = 40 + Math.floor((processed / tableList.length) * 50);
      backupProgress = { current: progress, total: 100, status: `Restaurando ${tableName}...` };
    }

    // Commit transaction
    await client.query('COMMIT');

    backupProgress = { current: 100, total: 100, status: 'Restauro completo!' };

    res.json({
      success: true,
      message: 'Backup restaurado com sucesso',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    backupProgress = { current: 0, total: 100, status: 'Erro: ' + error.message };
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

export default router;
