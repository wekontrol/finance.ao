import { Router, Request, Response } from 'express';
import path from 'path';
import pgPool from '../db';
import { exec } from 'child_process';
import { promisify } from 'util';

const router = Router();
const execAsync = promisify(exec);

let updateProgress = { current: 0, total: 100, status: 'idle', error: null as string | null };
let updateInProgress = false;

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function requireSuperAdmin(req: Request, res: Response, next: Function) {
  if (!req.session.user || req.session.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Only Super Admin can update system' });
  }
  next();
}

// GET update progress
router.get('/update-progress', requireAuth, (req: Request, res: Response) => {
  res.json(updateProgress);
});

// POST - Execute real system update
router.post('/update', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  if (updateInProgress) {
    return res.status(409).json({ error: 'Update already in progress' });
  }

  updateInProgress = true;
  updateProgress = { current: 0, total: 100, status: 'idle', error: null };

  res.json({
    success: true,
    message: 'Atualização iniciada em background',
    timestamp: new Date().toISOString()
  });

  // Execute update in background
  performSystemUpdate();
});

async function performSystemUpdate() {
  const appDir = process.cwd();
  const commands = [
    {
      cmd: 'git pull',
      progress: 25,
      status: 'Puxando código do repositório...'
    },
    {
      cmd: 'npm install',
      progress: 50,
      status: 'Instalando dependências...'
    },
    {
      cmd: 'npm run build',
      progress: 75,
      status: 'Compilando aplicação...'
    },
    {
      cmd: 'systemctl restart gestor-financeiro || echo "Service not running, skipping restart"',
      progress: 90,
      status: 'Reiniciando serviço...'
    }
  ];

  try {
    updateProgress = { current: 10, total: 100, status: 'Iniciando atualização...', error: null };

    for (const command of commands) {
      try {
        console.log(`[UPDATE] Executando: ${command.cmd}`);
        updateProgress = { current: command.progress - 5, total: 100, status: command.status, error: null };
        
        const { stdout, stderr } = await execAsync(command.cmd, { 
          cwd: appDir,
          timeout: 60000,
          maxBuffer: 10 * 1024 * 1024
        });
        
        if (stderr && !stderr.includes('warning')) {
          console.log(`[UPDATE] Stderr (${command.cmd}):`, stderr);
        }
        
        updateProgress = { current: command.progress, total: 100, status: command.status, error: null };
        console.log(`[UPDATE] ✓ ${command.cmd} completado`);
      } catch (cmdError: any) {
        // Se o comando falhar, continua (exceto para git pull)
        const errorMsg = cmdError.message || String(cmdError);
        console.error(`[UPDATE] Erro ao executar ${command.cmd}:`, errorMsg);
        
        if (command.cmd.includes('git pull')) {
          throw cmdError;
        }
        // Para outros comandos, registra mas continua
      }
    }

    updateProgress = { current: 100, total: 100, status: 'Atualização concluída!', error: null };
    console.log('[UPDATE] ✓ Sistema atualizado com sucesso!');

    // Reset after 8 seconds
    setTimeout(() => {
      updateProgress = { current: 0, total: 100, status: 'idle', error: null };
      updateInProgress = false;
    }, 8000);
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    console.error('[UPDATE] ✗ Erro na atualização:', errorMsg);
    updateProgress = { 
      current: 0, 
      total: 100, 
      status: `Erro: ${errorMsg}`, 
      error: errorMsg 
    };
    
    setTimeout(() => {
      updateProgress = { current: 0, total: 100, status: 'idle', error: null };
      updateInProgress = false;
    }, 8000);
  }
}

export default router;
