import { Router, Request, Response } from 'express';
import pgPool from '../db/postgres';

const router = Router();

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

router.use(requireAuth);

router.get('/', async (req: Request, res: Response) => {
  const userId = req.session.userId;
  const user = req.session.user;

  try {
    let goalsResult;
    if (user.role === 'SUPER_ADMIN' || user.role === 'MANAGER') {
      goalsResult = await pgPool.query(`
        SELECT g.* FROM savings_goals g
        JOIN users u ON g.user_id = u.id
        WHERE u.family_id = $1 OR g.user_id = $2
      `, [user.familyId, userId]);
    } else {
      goalsResult = await pgPool.query('SELECT * FROM savings_goals WHERE user_id = $1', [userId]);
    }

    const goals = goalsResult.rows;

    const formattedGoals = await Promise.all(goals.map(async (g: any) => {
      const historyResult = await pgPool.query(`
        SELECT * FROM goal_transactions WHERE goal_id = $1 ORDER BY date DESC
      `, [g.id]);

      const history = historyResult.rows;

      return {
        id: g.id,
        name: g.name,
        targetAmount: Number(g.target_amount),
        currentAmount: Number(g.current_amount),
        deadline: g.deadline,
        color: g.color,
        interestRate: g.interest_rate ? Number(g.interest_rate) : null,
        history: history.map((h: any) => ({
          id: h.id,
          userId: h.user_id,
          date: h.date,
          amount: Number(h.amount),
          note: h.note
        }))
      };
    }));

    res.json(formattedGoals);
  } catch (error) {
    console.error('Error fetching goals:', error);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const userId = req.session.userId;
  const { name, targetAmount, deadline, color, interestRate } = req.body;

  if (!name || !targetAmount) {
    return res.status(400).json({ error: 'Name and target amount are required' });
  }

  const id = `g${Date.now()}`;

  try {
    await pgPool.query(`
      INSERT INTO savings_goals (id, user_id, name, target_amount, current_amount, deadline, color, interest_rate)
      VALUES ($1, $2, $3, $4, 0, $5, $6, $7)
    `, [id, userId, name, targetAmount, deadline || null, color || '#10B981', interestRate || null]);

    const goalResult = await pgPool.query('SELECT * FROM savings_goals WHERE id = $1', [id]);
    const goal = goalResult.rows[0];

    res.status(201).json({
      id: goal.id,
      name: goal.name,
      targetAmount: Number(goal.target_amount),
      currentAmount: Number(goal.current_amount),
      deadline: goal.deadline,
      color: goal.color,
      interestRate: goal.interest_rate ? Number(goal.interest_rate) : null,
      history: []
    });
  } catch (error) {
    console.error('Error creating goal:', error);
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

router.post('/:id/contribute', async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.session.userId;
  const { amount, note } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Valid amount is required' });
  }

  try {
    const goalResult = await pgPool.query('SELECT * FROM savings_goals WHERE id = $1', [id]);
    const goal = goalResult.rows[0];
    
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const transactionId = `gt${Date.now()}`;
    const newAmount = Number(goal.current_amount) + amount;

    await pgPool.query(`
      INSERT INTO goal_transactions (id, goal_id, user_id, date, amount, note)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [transactionId, id, userId, new Date().toISOString().split('T')[0], amount, note || null]);

    await pgPool.query('UPDATE savings_goals SET current_amount = $1 WHERE id = $2', [newAmount, id]);

    const updatedGoalResult = await pgPool.query('SELECT * FROM savings_goals WHERE id = $1', [id]);
    const updatedGoal = updatedGoalResult.rows[0];
    
    const historyResult = await pgPool.query('SELECT * FROM goal_transactions WHERE goal_id = $1 ORDER BY date DESC', [id]);
    const history = historyResult.rows;

    res.json({
      id: updatedGoal.id,
      name: updatedGoal.name,
      targetAmount: Number(updatedGoal.target_amount),
      currentAmount: Number(updatedGoal.current_amount),
      deadline: updatedGoal.deadline,
      color: updatedGoal.color,
      interestRate: updatedGoal.interest_rate ? Number(updatedGoal.interest_rate) : null,
      history: history.map((h: any) => ({
        id: h.id,
        userId: h.user_id,
        date: h.date,
        amount: Number(h.amount),
        note: h.note
      }))
    });
  } catch (error) {
    console.error('Error contributing to goal:', error);
    res.status(500).json({ error: 'Failed to contribute to goal' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, targetAmount, deadline, color, interestRate } = req.body;

  try {
    const existingResult = await pgPool.query('SELECT * FROM savings_goals WHERE id = $1', [id]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    await pgPool.query(`
      UPDATE savings_goals 
      SET name = $1, target_amount = $2, deadline = $3, color = $4, interest_rate = $5
      WHERE id = $6
    `, [name, targetAmount, deadline, color, interestRate, id]);

    const goalResult = await pgPool.query('SELECT * FROM savings_goals WHERE id = $1', [id]);
    const goal = goalResult.rows[0];
    
    const historyResult = await pgPool.query('SELECT * FROM goal_transactions WHERE goal_id = $1 ORDER BY date DESC', [id]);
    const history = historyResult.rows;

    res.json({
      id: goal.id,
      name: goal.name,
      targetAmount: Number(goal.target_amount),
      currentAmount: Number(goal.current_amount),
      deadline: goal.deadline,
      color: goal.color,
      interestRate: goal.interest_rate ? Number(goal.interest_rate) : null,
      history: history.map((h: any) => ({
        id: h.id,
        userId: h.user_id,
        date: h.date,
        amount: Number(h.amount),
        note: h.note
      }))
    });
  } catch (error) {
    console.error('Error updating goal:', error);
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.session.userId;
  const user = req.session.user;

  try {
    const existingResult = await pgPool.query(`
      SELECT g.*, u.family_id FROM savings_goals g 
      JOIN users u ON g.user_id = u.id 
      WHERE g.id = $1
    `, [id]);
    
    const existing = existingResult.rows[0];
    if (!existing) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const canDelete = existing.user_id === userId || 
                      user.role === 'SUPER_ADMIN' || 
                      (user.role === 'MANAGER' && existing.family_id === user.familyId);
    
    if (!canDelete) {
      return res.status(403).json({ error: 'Not authorized to delete this goal' });
    }

    await pgPool.query('DELETE FROM goal_transactions WHERE goal_id = $1', [id]);
    await pgPool.query('DELETE FROM savings_goals WHERE id = $1', [id]);
    
    res.json({ message: 'Goal deleted' });
  } catch (error) {
    console.error('Error deleting goal:', error);
    res.status(500).json({ error: 'Failed to delete goal' });
  }
});

export default router;
