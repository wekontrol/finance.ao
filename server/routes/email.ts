import { Router, Request, Response } from 'express';
import pgPool from '../db/postgres';
import { sendEmail, sendBudgetAlertEmail } from '../services/emailService';

const router = Router();

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function requireAdmin(req: Request, res: Response, next: Function) {
  const user = req.session!.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

router.use(requireAuth);

// Send test email
router.post('/test', async (req: Request, res: Response) => {
  try {
    const user = req.session!.user as any;
    const userId = req.session!.userId as string;

    // Get user email from database
    const result = await pgPool.query('SELECT email FROM users WHERE id = $1', [userId]);
    const userRecord = result.rows[0];
    
    if (!userRecord || !userRecord.email) {
      return res.status(400).json({ error: 'User email not configured' });
    }

    const success = await sendEmail({
      to: userRecord.email,
      subject: '📧 Teste - Gestor Financeiro',
      body: `Olá ${user.name},\n\nEste é um email de teste do sistema de notificações.\n\nSe você recebeu esta mensagem, o sistema de email está funcionando corretamente!`,
      html: `
        <h2>📧 Email de Teste</h2>
        <p>Olá <strong>${user.name}</strong>,</p>
        <p>Este é um email de teste do sistema de notificações.</p>
        <p>Se você recebeu esta mensagem, o sistema de email está funcionando corretamente!</p>
      `
    });

    res.json({ 
      message: success ? 'Email de teste enviado' : 'Email enviado (fallback - sem configuração)',
      sent: success
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get user email configuration
router.get('/config', async (req: Request, res: Response) => {
  try {
    const userId = req.session!.userId as string;
    const result = await pgPool.query('SELECT email FROM users WHERE id = $1', [userId]);
    const userRecord = result.rows[0];

    res.json({
      hasEmail: !!userRecord?.email,
      email: userRecord?.email ? userRecord.email.replace(/(.{2})(.*)(.{2})/, '$1***$3') : null
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
