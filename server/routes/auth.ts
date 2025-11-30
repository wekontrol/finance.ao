import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pgPool from '../db/postgres';
import { autoSaveMonthlyHistory } from './budget';

const router = Router();

declare module 'express-session' {
  interface SessionData {
    userId: string;
    user: any;
  }
}

router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const result = await pgPool.query(`
      SELECT id, username, password, name, role, avatar, status, created_by, family_id, birth_date, allow_parent_view
      FROM users WHERE username = $1
    `, [username]);

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.status !== 'APPROVED') {
      return res.status(403).json({ error: 'Account not approved' });
    }

    const { password: _, ...userWithoutPassword } = user;
    userWithoutPassword.allowParentView = !!user.allow_parent_view;
    userWithoutPassword.birthDate = user.birth_date;
    userWithoutPassword.createdBy = user.created_by;
    userWithoutPassword.familyId = user.family_id;

    req.session.userId = user.id;
    req.session.user = userWithoutPassword;

    autoSaveMonthlyHistory(user.id);

    res.json({ user: userWithoutPassword });
  } catch (error: any) {
    console.error('Login error:', error.message);
    return res.status(500).json({ error: 'Login failed', details: error.message });
  }
});

router.post('/register', async (req: Request, res: Response) => {
  const { username, password, name, email, familyName, securityQuestion, securityAnswer } = req.body;

  if (!username || !password || !name || !familyName) {
    return res.status(400).json({ error: 'All fields are required (username, password, name, familyName)' });
  }

  try {
    const existingResult = await pgPool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existingResult.rows[0]) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const defaultBudgets = [
      { category: 'Alimentação', limit: 500 },
      { category: 'Transporte', limit: 200 },
      { category: 'Saúde', limit: 300 },
      { category: 'Educação', limit: 400 },
      { category: 'Entretenimento', limit: 150 },
      { category: 'Utilidades', limit: 350 },
      { category: 'Vestuário', limit: 250 },
      { category: 'Comunicação', limit: 100 },
      { category: 'Seguros', limit: 200 },
      { category: 'Poupança', limit: 1000 },
      { category: 'Investimentos', limit: 500 },
      { category: 'Lazer', limit: 200 },
      { category: 'Viagens', limit: 300 },
      { category: 'Casa', limit: 400 },
      { category: 'Pets', limit: 150 },
      { category: 'Geral', limit: 500 }
    ];

    const userId = `u${Date.now()}`;
    const hashedPassword = bcrypt.hashSync(password, 10);
    const familyId = `fam_${Date.now()}`;

    await pgPool.query(`
      INSERT INTO families (id, name)
      VALUES ($1, $2)
    `, [familyId, familyName.trim()]);

    await pgPool.query(`
      INSERT INTO users (id, username, password, name, email, role, avatar, status, family_id, security_question, security_answer)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      userId,
      username,
      hashedPassword,
      name,
      email || null,
      'MANAGER',
      '/default-avatar.svg',
      'APPROVED',
      familyId,
      securityQuestion || null,
      securityAnswer ? securityAnswer.toLowerCase() : null
    ]);

    try {
      let budgetsCreated = 0;
      for (const budget of defaultBudgets) {
        const budgetId = `bl${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
        await pgPool.query(`
          INSERT INTO budget_limits (id, user_id, category, limit_amount, is_default)
          VALUES ($1, $2, $3, $4, 1)
        `, [budgetId, userId, budget.category, budget.limit]);
        budgetsCreated++;
      }
      console.log(`✓ Created ${budgetsCreated} default budgets for user ${userId}`);
    } catch (error: any) {
      console.error(`✗ Error creating default budgets for user ${userId}:`, error.message);
      return res.status(500).json({ error: 'Failed to create default budgets', details: error.message });
    }

    const userResult = await pgPool.query(`
      SELECT id, username, name, role, avatar, status, family_id as "familyId"
      FROM users WHERE id = $1
    `, [userId]);

    const user = userResult.rows[0];

    req.session.userId = user.id;
    req.session.user = user;

    res.status(201).json({ user });
  } catch (error: any) {
    console.error('Registration error:', error.message);
    return res.status(500).json({ error: 'Registration failed', details: error.message });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

router.get('/me', (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ user: req.session.user });
});

router.post('/recover-password', async (req: Request, res: Response) => {
  const { username, securityAnswer, newPassword } = req.body;

  try {
    const result = await pgPool.query('SELECT id, security_answer FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.security_answer || user.security_answer !== securityAnswer.toLowerCase()) {
      return res.status(401).json({ error: 'Security answer is incorrect' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    await pgPool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, user.id]);

    res.json({ message: 'Password updated successfully' });
  } catch (error: any) {
    console.error('Password recovery error:', error.message);
    return res.status(500).json({ error: 'Password recovery failed', details: error.message });
  }
});

export default router;
