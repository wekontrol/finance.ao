import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/schema';

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
  // Fix for timezone issues, ensuring calculations are based on UTC date
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

export function processRecurringTransactions() {
  const today = new Date().toISOString().split('T')[0];

  const dueTransactions = db.prepare(`
    SELECT * FROM transactions
    WHERE is_recurring = 1 AND next_due_date IS NOT NULL AND next_due_date <= ?
  `).all(today) as any[];

  if (dueTransactions.length > 0) {
    console.log(`[Recurring] Encontradas ${dueTransactions.length} transações recorrentes vencidas.`);
  }

  dueTransactions.forEach(t => {
    // 1. Create the new transaction
    const newId = uuidv4();
    db.prepare(`
      INSERT INTO transactions (id, user_id, description, amount, date, category, type, is_recurring, frequency)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)
    `).run(newId, t.user_id, t.description, t.amount, today, t.category, t.type);

    // 2. Update the original recurring transaction with the next due date
    const nextDueDate = calculateNextDueDate(t.next_due_date, t.frequency);
    db.prepare(`
      UPDATE transactions SET next_due_date = ? WHERE id = ?
    `).run(nextDueDate, t.id);

    console.log(`[Recurring] Processada transação ${t.id}. Nova transação ${newId} criada. Próximo vencimento: ${nextDueDate}`);
  });
}

export function startRecurringTransactionsScheduler() {
  const interval = setInterval(processRecurringTransactions, 60 * 60 * 1000); // Every hour
  setTimeout(processRecurringTransactions, 2000); // Run on startup
  console.log('🔄 [Recurring] Agendador de transações recorrentes iniciado.');
  return interval;
}

function canViewUserTransactions(viewerId: string, viewerRole: string, viewerFamilyId: string, targetUserId: string): boolean {
  if (viewerId === targetUserId) return true;
  if (viewerRole === 'SUPER_ADMIN') return true;
  
  if (viewerRole === 'MANAGER') {
    const targetUser = db.prepare(`
      SELECT id, family_id, birth_date, allow_parent_view FROM users WHERE id = ?
    `).get(targetUserId) as any;
    
    if (!targetUser) return false;
    if (targetUser.family_id !== viewerFamilyId) return false;
    
    if (isMinor(targetUser.birth_date)) return true;
    if (targetUser.allow_parent_view === 1) return true;
  }
  
  return false;
}

router.use(requireAuth);

router.get('/', (req: Request, res: Response) => {
  const userId = req.session.userId;
  const user = req.session.user;

  let transactions;
  
  if (user.role === 'SUPER_ADMIN') {
    transactions = db.prepare(`
      SELECT t.*, u.name as user_name 
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.id
      ORDER BY t.date DESC
    `).all();
  } else if (user.role === 'MANAGER') {
    const allFamilyTransactions = db.prepare(`
      SELECT t.*, u.name as user_name
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE u.family_id = ?
      ORDER BY t.date DESC
    `).all(user.familyId);

    transactions = allFamilyTransactions.filter((t: any) =>
      canViewUserTransactions(user.id, user.role, user.familyId, t.user_id)
    );
  } else {
    transactions = db.prepare(`
      SELECT t.*, u.name as user_name 
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.user_id = ? 
      ORDER BY t.date DESC
    `).all(userId);
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

router.post('/', (req: Request, res: Response) => {
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

  db.prepare(`
    INSERT INTO transactions (id, user_id, description, amount, date, category, type, is_recurring, frequency, next_due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, description, amount, date, category, type, isRecurring ? 1 : 0, frequency || null, nextDueDate);

  const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as any;
  
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

router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.session.userId;
  const user = req.session.user;
  const { description, amount, date, category, type, isRecurring, frequency } = req.body;

  const existing = db.prepare('SELECT t.*, u.family_id FROM transactions t JOIN users u ON t.user_id = u.id WHERE t.id = ?').get(id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const canEdit = canViewUserTransactions(userId!, user.role, user.familyId, existing.user_id);
  
  if (!canEdit) {
    return res.status(403).json({ error: 'Not authorized to edit this transaction' });
  }

  db.prepare(`
    UPDATE transactions 
    SET description = ?, amount = ?, date = ?, category = ?, type = ?, is_recurring = ?, frequency = ?
    WHERE id = ?
  `).run(description, amount, date, category, type, isRecurring ? 1 : 0, frequency || null, id);

  const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as any;
  
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

router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.session.userId;
  const user = req.session.user;

  const existing = db.prepare('SELECT t.*, u.family_id FROM transactions t JOIN users u ON t.user_id = u.id WHERE t.id = ?').get(id) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const canDelete = canViewUserTransactions(userId!, user.role, user.familyId, existing.user_id);
  
  if (!canDelete) {
    return res.status(403).json({ error: 'Not authorized to delete this transaction' });
  }

  db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
  res.json({ message: 'Transaction deleted' });
});

export default router;
