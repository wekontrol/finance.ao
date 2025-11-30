import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pgPool from '../db';

const router = Router();

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

router.use(requireAuth);

router.get('/', async (req: Request, res: Response) => {
  const user = req.session.user;

  let users;
  if (user.role === 'SUPER_ADMIN') {
    const result = await pgPool.query(`
      SELECT id, username, name, role, avatar, status, created_by, family_id, birth_date, allow_parent_view
      FROM users
    `);
    users = result.rows;
  } else if (user.role === 'MANAGER') {
    const result = await pgPool.query(`
      SELECT id, username, name, role, avatar, status, created_by, family_id, birth_date, allow_parent_view
      FROM users WHERE family_id = ?
    `, [user.familyId]);
    users = result.rows;
  } else {
    const result = await pgPool.query(`
      SELECT id, username, name, role, avatar, status, family_id
      FROM users WHERE id = ?
    `, [req.session.userId]);
    users = result.rows;
  }

  const formattedUsers = users.map((u: any) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    avatar: u.avatar,
    status: u.status,
    createdBy: u.created_by,
    familyId: u.family_id,
    birthDate: u.birth_date,
    allowParentView: !!u.allow_parent_view
  }));

  res.json(formattedUsers);
});

router.post('/', async (req: Request, res: Response) => {
  const currentUser = req.session.user;
  const { username, password, name, role, birthDate, allowParentView, familyId } = req.body;

  if (currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'MANAGER') {
    return res.status(403).json({ error: 'Not authorized to create users' });
  }

  if (!username || !password || !name) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const existingResult = await pgPool.query('SELECT id FROM users WHERE username = ?', [username]);
  const existingUser = existingResult.rows[0];
  if (existingUser) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const id = `u${Date.now()}`;
  const hashedPassword = bcrypt.hashSync(password, 10);

  const defaultBudgets = [
    { category: 'Renda', limit: 0 },
    { category: 'Energia', limit: 150 },
    { category: 'Água', limit: 80 },
    { category: 'Transporte', limit: 200 },
    { category: 'Alimentação', limit: 300 },
    { category: 'Combustível', limit: 200 },
    { category: 'Compras domésticas', limit: 150 },
    { category: 'Lazer', limit: 150 },
    { category: 'Roupas', limit: 100 },
    { category: 'Saúde', limit: 200 },
    { category: 'Cuidados pessoais', limit: 80 },
    { category: 'Reparações e Manutenção', limit: 150 },
    { category: 'Presentes', limit: 100 },
    { category: 'Eventos', limit: 200 },
    { category: 'Viagens', limit: 300 }
  ];

  let newFamilyId = currentUser.familyId;
  if (currentUser.role === 'SUPER_ADMIN' && familyId) {
    newFamilyId = familyId;
  }

  await pgPool.query(`
    INSERT INTO users (id, username, password, name, role, avatar, status, created_by, family_id, birth_date, allow_parent_view)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    username,
    hashedPassword,
    name,
    role || 'MEMBER',
    '/default-avatar.svg',
    'APPROVED',
    req.session.userId,
    newFamilyId,
    birthDate || null,
    allowParentView ? 1 : 0
  ]);

  for (const budget of defaultBudgets) {
    const budgetId = `bl${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
    await pgPool.query(`
      INSERT INTO budget_limits (id, user_id, category, limit_amount, is_default)
      VALUES (?, ?, ?, ?, 1)
    `, [budgetId, id, budget.category, budget.limit]);
  }

  const userResult = await pgPool.query(`
    SELECT id, username, name, role, avatar, status, created_by, family_id, birth_date, allow_parent_view
    FROM users WHERE id = ?
  `, [id]);
  const user = userResult.rows[0];

  res.status(201).json({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    avatar: user.avatar,
    status: user.status,
    createdBy: user.created_by,
    familyId: user.family_id,
    birthDate: user.birth_date,
    allowParentView: !!user.allow_parent_view
  });
});

router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const currentUser = req.session.user;
  const { name, role, status, birthDate, allowParentView, password } = req.body;

  const isOwnProfile = id === req.session.userId;
  const canEdit = currentUser.role === 'SUPER_ADMIN' || 
                  currentUser.role === 'MANAGER' || 
                  isOwnProfile;

  if (!canEdit) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const existingResult = await pgPool.query('SELECT * FROM users WHERE id = ?', [id]);
  const existing = existingResult.rows[0];
  if (!existing) {
    return res.status(404).json({ error: 'User not found' });
  }

  let updateQuery = 'UPDATE users SET name = ?';
  let params: any[] = [name || existing.name];
  let paramIndex = 2;

  if (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'MANAGER') {
    if (role) {
      updateQuery += `, role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }
    if (status) {
      updateQuery += `, status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
  }

  if (birthDate !== undefined) {
    updateQuery += `, birth_date = $${paramIndex}`;
    params.push(birthDate);
    paramIndex++;
  }

  if (allowParentView !== undefined) {
    updateQuery += `, allow_parent_view = $${paramIndex}`;
    params.push(allowParentView ? true : false);
    paramIndex++;
  }

  if (password) {
    updateQuery += `, password = $${paramIndex}`;
    params.push(bcrypt.hashSync(password, 10));
    paramIndex++;
  }

  updateQuery += ` WHERE id = $${paramIndex}`;
  params.push(id);

  await pgPool.query(updateQuery, params);

  const userResult = await pgPool.query(`
    SELECT id, username, name, role, avatar, status, created_by, family_id, birth_date, allow_parent_view
    FROM users WHERE id = ?
  `, [id]);
  const user = userResult.rows[0];

  res.json({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    avatar: user.avatar,
    status: user.status,
    createdBy: user.created_by,
    familyId: user.family_id,
    birthDate: user.birth_date,
    allowParentView: !!user.allow_parent_view
  });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const currentUser = req.session.user;

  if (currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'MANAGER') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  if (id === req.session.userId) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  const existingResult = await pgPool.query('SELECT * FROM users WHERE id = ?', [id]);
  const existing = existingResult.rows[0];
  if (!existing) {
    return res.status(404).json({ error: 'User not found' });
  }

  await pgPool.query('DELETE FROM budget_limits WHERE user_id = ?', [id]);
  await pgPool.query('DELETE FROM users WHERE id = ?', [id]);
  res.json({ message: 'User deleted' });
});

export default router;
