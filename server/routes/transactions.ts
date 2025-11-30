import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pgPool from '../db/postgres';

const router = Router();

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function isMinor(birthDate: string | null): boolean {
  if (!birthDate) return false;
  const birth = new Date(birthDate);
  const today = new Date();
  const age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    return age - 1 < 18;
  }
  return age < 18;
}

function calculateNextDueDate(startDate: string, frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'): string | null {
  if (!startDate || !frequency) return null;

  const date = new Date(startDate);
  date.setUTCHours(0, 0, 0, 0);

  switch (frequency) {
    case 'daily':
      date.setUTCDate(date.getUTCDate() + 1);
      break;
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case 'monthly':
      date.setUTCMonth(date.getUTCMonth() + 1);
      break;
    case 'yearly':
      date.setUTCFullYear(date.getUTCFullYear() + 1);
      break;
    default:
      return null;
  }
  return date.toISOString().split('T')[0];
}

export async function processRecurringTransactions() {
  const today = new Date().toISOString().split('T')[0];

  const dueResult = await pgPool.query(`
    SELECT * FROM transactions
    WHERE is_recurring = 1 AND next_due_date IS NOT NULL AND next_due_date <= $1
  `, [today]);
  
  const dueTransactions = dueResult.rows;

  if (dueTransactions.length > 0) {
    console.log(`[Recurring] Encontradas ${dueTransactions.length} transações recorrentes vencidas.`);
  }

  for (const t of dueTransactions) {
    const newId = uuidv4();
    await pgPool.query(`
      INSERT INTO transactions (id, user_id, description, amount, date, category, type, is_recurring, frequency)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0, NULL)
    `, [newId, t.user_id, t.description, t.amount, today, t.category, t.type]);

    const nextDueDate = calculateNextDueDate(t.next_due_date, t.frequency);
    await pgPool.query(`
      UPDATE transactions SET next_due_date = $1 WHERE id = $2
    `, [nextDueDate, t.id]);

    console.log(`[Recurring] Processada transação ${t.id}. Nova transação ${newId} criada. Próximo vencimento: ${nextDueDate}`);
  }
}

export function startRecurringTransactionsScheduler() {
  const interval = setInterval(processRecurringTransactions, 60 * 60 * 1000);
  setTimeout(processRecurringTransactions, 2000);
  console.log('🔄 [Recurring] Agendador de transações recorrentes iniciado.');
  return interval;
}

async function canViewUserTransactions(viewerId: string, viewerRole: string, viewerFamilyId: string, targetUserId: string): Promise<boolean> {
  if (viewerId === targetUserId) return true;
  if (viewerRole === 'SUPER_ADMIN') return true;
  
  if (viewerRole === 'MANAGER') {
    const result = await pgPool.query(`
      SELECT id, family_id, birth_date, allow_parent_view FROM users WHERE id = $1
    `, [targetUserId]);
    
    const targetUser = result.rows[0];
    
    if (!targetUser) return false;
    if (targetUser.family_id !== viewerFamilyId) return false;
    
    if (isMinor(targetUser.birth_date)) return true;
    if (targetUser.allow_parent_view === true) return true;
  }
  
  return false;
}

router.use(requireAuth);

router.get('/', async (req: Request, res: Response) => {
  const userId = req.session.userId;
  const user = req.session.user;

  let transactions;
  
  if (user.role === 'SUPER_ADMIN') {
    const result = await pgPool.query(`
      SELECT t.*, u.name as user_name 
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.id
      ORDER BY t.date DESC
    `);
    transactions = result.rows;
  } else if (user.role === 'MANAGER') {
    const result = await pgPool.query(`
      SELECT t.*, u.name as user_name
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE u.family_id = $1
      ORDER BY t.date DESC
    `, [user.familyId]);

    const allFamilyTransactions = result.rows;
    
    const filteredTransactions = [];
    for (const t of allFamilyTransactions) {
      const canView = await canViewUserTransactions(user.id, user.role, user.familyId, t.user_id);
      if (canView) {
        filteredTransactions.push(t);
      }
    }
    transactions = filteredTransactions;
  } else {
    const result = await pgPool.query(`
      SELECT t.*, u.name as user_name 
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.user_id = $1 
      ORDER BY t.date DESC
    `, [userId]);
    transactions = result.rows;
  }

  const formattedTransactions = transactions.map((t: any) => ({
    id: t.id,
    userId: t.user_id,
    description: t.description,
    amount: t.amount,
    date: t.date,
    category: t.category,
    type: t.type,
    isRecurring: !!t.is_recurring,
    frequency: t.frequency,
    nextDueDate: t.next_due_date,
    userName: t.user_name
  }));

  res.json(formattedTransactions);
});

router.post('/', async (req: Request, res: Response) => {
  const userId = req.session.userId;
  const { description, amount, date, category, type, isRecurring, frequency } = req.body;

  if (!description || amount === undefined || !date || !category || !type) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (typeof amount !== 'number') {
    return res.status(400).json({ error: 'Amount must be a number' });
  }

  const id = uuidv4();
  
  const nextDueDate = isRecurring ? calculateNextDueDate(date, frequency) : null;

  await pgPool.query(`
    INSERT INTO transactions (id, user_id, description, amount, date, category, type, is_recurring, frequency, next_due_date)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [id, userId, description, amount, date, category, type, isRecurring ? true : false, frequency || null, nextDueDate]);

  const result = await pgPool.query('SELECT * FROM transactions WHERE id = $1', [id]);
  const transaction = result.rows[0];
  
  res.status(201).json({
    id: transaction.id,
    userId: transaction.user_id,
    description: transaction.description,
    amount: transaction.amount,
    date: transaction.date,
    category: transaction.category,
    type: transaction.type,
    isRecurring: !!transaction.is_recurring,
    frequency: transaction.frequency,
    nextDueDate: transaction.next_due_date
  });
});

router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.session.userId;
  const user = req.session.user;
  const { description, amount, date, category, type, isRecurring, frequency } = req.body;

  const existingResult = await pgPool.query('SELECT t.*, u.family_id FROM transactions t JOIN users u ON t.user_id = u.id WHERE t.id = $1', [id]);
  const existing = existingResult.rows[0];
  
  if (!existing) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const canEdit = await canViewUserTransactions(userId!, user.role, user.familyId, existing.user_id);
  
  if (!canEdit) {
    return res.status(403).json({ error: 'Not authorized to edit this transaction' });
  }

  await pgPool.query(`
    UPDATE transactions 
    SET description = $1, amount = $2, date = $3, category = $4, type = $5, is_recurring = $6, frequency = $7
    WHERE id = $8
  `, [description, amount, date, category, type, isRecurring ? true : false, frequency || null, id]);

  const result = await pgPool.query('SELECT * FROM transactions WHERE id = $1', [id]);
  const transaction = result.rows[0];
  
  res.json({
    id: transaction.id,
    userId: transaction.user_id,
    description: transaction.description,
    amount: transaction.amount,
    date: transaction.date,
    category: transaction.category,
    type: transaction.type,
    isRecurring: !!transaction.is_recurring,
    frequency: transaction.frequency
  });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.session.userId;
  const user = req.session.user;

  const existingResult = await pgPool.query('SELECT t.*, u.family_id FROM transactions t JOIN users u ON t.user_id = u.id WHERE t.id = $1', [id]);
  const existing = existingResult.rows[0];
  
  if (!existing) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const canDelete = await canViewUserTransactions(userId!, user.role, user.familyId, existing.user_id);
  
  if (!canDelete) {
    return res.status(403).json({ error: 'Not authorized to delete this transaction' });
  }

  await pgPool.query('DELETE FROM transactions WHERE id = $1', [id]);
  res.json({ message: 'Transaction deleted' });
});

export default router;
