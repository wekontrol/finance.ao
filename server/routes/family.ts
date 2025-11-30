import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pgPool from '../db';

const router = Router();

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

router.use(requireAuth);

router.get('/tasks', async (req: Request, res: Response) => {
  const user = req.session.user;

  const result = await pgPool.query(`
    SELECT t.*, u.name as assigned_to_name
    FROM family_tasks t
    LEFT JOIN users u ON t.assigned_to = u.id
    WHERE t.family_id = ?
    ORDER BY t.due_date ASC
  `, [user.familyId]);

  const formattedTasks = result.rows.map((t: any) => ({
    id: t.id,
    description: t.description,
    assignedTo: t.assigned_to,
    assignedToName: t.assigned_to_name,
    isCompleted: !!t.is_completed,
    dueDate: t.due_date
  }));

  res.json(formattedTasks);
});

router.post('/tasks', async (req: Request, res: Response) => {
  const user = req.session.user;
  const { description, assignedTo, dueDate } = req.body;

  if (!description) {
    return res.status(400).json({ error: 'Description is required' });
  }

  const id = uuidv4();
  
  await pgPool.query(`
    INSERT INTO family_tasks (id, family_id, description, assigned_to, due_date)
    VALUES (?, ?, ?, ?, ?)
  `, [id, user.familyId, description, assignedTo || null, dueDate || null]);

  const taskResult = await pgPool.query(`
    SELECT t.*, u.name as assigned_to_name
    FROM family_tasks t
    LEFT JOIN users u ON t.assigned_to = u.id
    WHERE t.id = ?
  `, [id]);
  
  const task = taskResult.rows[0];
  
  res.status(201).json({
    id: task.id,
    description: task.description,
    assignedTo: task.assigned_to,
    assignedToName: task.assigned_to_name,
    isCompleted: false,
    dueDate: task.due_date
  });
});

router.put('/tasks/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.session.user;
  const { description, assignedTo, isCompleted, dueDate } = req.body;

  const existingResult = await pgPool.query('SELECT * FROM family_tasks WHERE id = ?', [id]);
  const existing = existingResult.rows[0];
  
  if (!existing) {
    return res.status(404).json({ error: 'Task not found' });
  }

  if (existing.family_id !== user.familyId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const newValues = {
    description: description || existing.description,
    assignedTo: assignedTo !== undefined ? assignedTo : existing.assigned_to,
    isCompleted: isCompleted !== undefined ? isCompleted : existing.is_completed,
    dueDate: dueDate !== undefined ? dueDate : existing.due_date
  };

  await pgPool.query(`
    UPDATE family_tasks 
    SET description = ?, assigned_to = ?, is_completed = ?, due_date = ?
    WHERE id = ?
  `, [newValues.description, newValues.assignedTo, newValues.isCompleted, newValues.dueDate, id]);

  const taskResult = await pgPool.query(`
    SELECT t.*, u.name as assigned_to_name
    FROM family_tasks t
    LEFT JOIN users u ON t.assigned_to = u.id
    WHERE t.id = ?
  `, [id]);
  
  const task = taskResult.rows[0];
  
  res.json({
    id: task.id,
    description: task.description,
    assignedTo: task.assigned_to,
    assignedToName: task.assigned_to_name,
    isCompleted: !!task.is_completed,
    dueDate: task.due_date
  });
});

router.delete('/tasks/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.session.user;

  const existingResult = await pgPool.query('SELECT * FROM family_tasks WHERE id = ?', [id]);
  const existing = existingResult.rows[0];
  
  if (!existing) {
    return res.status(404).json({ error: 'Task not found' });
  }

  if (existing.family_id !== user.familyId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  await pgPool.query('DELETE FROM family_tasks WHERE id = ?', [id]);
  res.json({ message: 'Task deleted' });
});

router.get('/events', async (req: Request, res: Response) => {
  const user = req.session.user;

  const result = await pgPool.query(`
    SELECT * FROM family_events WHERE family_id = ? ORDER BY \`date\` ASC
  `, [user.familyId]);

  const formattedEvents = result.rows.map((e: any) => ({
    id: e.id,
    title: e.title,
    date: e.date,
    type: e.type,
    description: e.description
  }));

  res.json(formattedEvents);
});

router.post('/events', async (req: Request, res: Response) => {
  const user = req.session.user;
  const { title, date, type, description } = req.body;

  if (!title || !date) {
    return res.status(400).json({ error: 'Title and date are required' });
  }

  const id = uuidv4();
  
  await pgPool.query(`
    INSERT INTO family_events (id, family_id, title, \`date\`, type, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, user.familyId, title, date, type || 'general', description || null]);

  const eventResult = await pgPool.query('SELECT * FROM family_events WHERE id = ?', [id]);
  const event = eventResult.rows[0];
  
  res.status(201).json({
    id: event.id,
    title: event.title,
    date: event.date,
    type: event.type,
    description: event.description
  });
});

router.put('/events/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.session.user;
  const { title, date, type, description } = req.body;

  const existingResult = await pgPool.query('SELECT * FROM family_events WHERE id = ?', [id]);
  const existing = existingResult.rows[0];
  
  if (!existing) {
    return res.status(404).json({ error: 'Event not found' });
  }

  if (existing.family_id !== user.familyId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const newValues = {
    title: title || existing.title,
    date: date || existing.date,
    type: type || existing.type,
    description: description !== undefined ? description : existing.description
  };

  await pgPool.query(`
    UPDATE family_events 
    SET title = ?, date = ?, type = ?, description = ?
    WHERE id = ?
  `, [newValues.title, newValues.date, newValues.type, newValues.description, id]);

  const eventResult = await pgPool.query('SELECT * FROM family_events WHERE id = ?', [id]);
  const event = eventResult.rows[0];
  
  res.json({
    id: event.id,
    title: event.title,
    date: event.date,
    type: event.type,
    description: event.description
  });
});

router.delete('/events/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.session.user;

  const existingResult = await pgPool.query('SELECT * FROM family_events WHERE id = ?', [id]);
  const existing = existingResult.rows[0];
  
  if (!existing) {
    return res.status(404).json({ error: 'Event not found' });
  }

  if (existing.family_id !== user.familyId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  await pgPool.query('DELETE FROM family_events WHERE id = ?', [id]);
  res.json({ message: 'Event deleted' });
});

export default router;
