import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pgPool from '../db/postgres';
import { findUserByUsername as findUserInMemory } from '../db/inmemory';
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
    let user: any = null;

    // Try database first
    const result = await pgPool.query(`
      SELECT id, username, password, name, role, avatar, status, created_by, family_id, birth_date, allow_parent_view
      FROM users WHERE username = $1
    `, [username]);

    user = result.rows[0];

    // If not found in DB, try in-memory (development)
    if (!user) {
      user = findUserInMemory(username);
    }

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

    req.session.save((err: any) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Session save failed' });
      }
      
      console.log(`✅ User ${user.id} logged in successfully`);
      autoSaveMonthlyHistory(user.id);
      res.json({ user: userWithoutPassword });
    });
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
    const familyId = `fam${Date.now()}`;

    // Create family
    await pgPool.query(
      `INSERT INTO families (id, name) VALUES ($1, $2)`,
      [familyId, familyName]
    );

    // Create user
    await pgPool.query(
      `INSERT INTO users (id, username, password, name, email, role, avatar, status, family_id, security_question, security_answer)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [userId, username, hashedPassword, name, email, 'ADMIN', 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + username, 'PENDING', familyId, securityQuestion, bcrypt.hashSync(securityAnswer, 10)]
    );

    // Create default budgets
    for (const budget of defaultBudgets) {
      const budgetId = `b${Date.now()}${Math.random()}`;
      await pgPool.query(
        `INSERT INTO budget_limits (id, user_id, category, limit_amount, is_default)
         VALUES ($1, $2, $3, $4, $5)`,
        [budgetId, userId, budget.category, budget.limit, true]
      );
    }

    res.status(201).json({ 
      message: 'User registered successfully. Wait for admin approval.',
      userId 
    });
  } catch (error: any) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
});

router.post('/forgot-password', async (req: Request, res: Response) => {
  const { username, securityAnswer } = req.body;

  try {
    const result = await pgPool.query(
      'SELECT id, security_answer FROM users WHERE username = $1',
      [username]
    );

    const user = result.rows[0];
    if (!user || !bcrypt.compareSync(securityAnswer, user.security_answer)) {
      return res.status(401).json({ error: 'Invalid security answer' });
    }

    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = bcrypt.hashSync(tempPassword, 10);

    await pgPool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, user.id]);

    res.json({ tempPassword, message: 'Temporary password sent' });
  } catch (error: any) {
    res.status(500).json({ error: 'Password reset failed' });
  }
});

router.get('/me', async (req: Request, res: Response) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const result = await pgPool.query(
      'SELECT id, username, name, role, avatar, status, family_id FROM users WHERE id = $1',
      [req.session.userId]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

export default router;
