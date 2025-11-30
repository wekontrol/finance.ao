import { Router, Request, Response } from 'express';
import db from '../db/schema';

const router = Router();

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function requireSuperAdmin(req: Request, res: Response, next: Function) {
  if (!req.session.user || req.session.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Only Super Admin can access families' });
  }
  next();
}

// GET all families (Super Admin only)
router.get('/', requireAuth, requireSuperAdmin, (req: Request, res: Response) => {
  const families = db.prepare(`
    SELECT 
      f.id,
      f.name,
      f.created_at,
      COUNT(u.id) as member_count
    FROM families f
    LEFT JOIN users u ON f.id = u.family_id
    GROUP BY f.id
    ORDER BY f.created_at DESC
  `).all();

  res.json(families);
});

// DELETE family (Super Admin only)
router.delete('/:id', requireAuth, requireSuperAdmin, (req: Request, res: Response) => {
  const { id } = req.params;

  // Don't allow deleting the default admin family
  if (id === 'fam_admin') {
    return res.status(403).json({ error: 'Cannot delete the default admin family' });
  }

  // Check if family exists
  const family = db.prepare('SELECT id FROM families WHERE id = ?').get(id);
  if (!family) {
    return res.status(404).json({ error: 'Family not found' });
  }

  const deleteFamily = db.transaction((familyId) => {
    // Get all user IDs from the family
    const users = db.prepare('SELECT id FROM users WHERE family_id = ?').all(familyId) as { id: string }[];
    const userIds = users.map(u => u.id);

    if (userIds.length > 0) {
      // Delete data linked to users
      db.prepare(`DELETE FROM transactions WHERE user_id IN (${userIds.map(() => '?').join(',')})`).run(...userIds);
      db.prepare(`DELETE FROM savings_goals WHERE user_id IN (${userIds.map(() => '?').join(',')})`).run(...userIds);
      db.prepare(`DELETE FROM budget_limits WHERE user_id IN (${userIds.map(() => '?').join(',')})`).run(...userIds);
    }

    // Delete data linked to the family directly
    db.prepare('DELETE FROM family_tasks WHERE family_id = ?').run(familyId);
    db.prepare('DELETE FROM family_events WHERE family_id = ?').run(familyId);

    // Finally, delete users and the family itself
    db.prepare('DELETE FROM users WHERE family_id = ?').run(familyId);
    db.prepare('DELETE FROM families WHERE id = ?').run(familyId);

    return { success: true };
  });

  try {
    const result = deleteFamily(id);
    if (result.success) {
      res.json({ message: 'Family and all associated data deleted successfully' });
    }
  } catch (error) {
    console.error('Failed to delete family:', error);
    res.status(500).json({ error: 'Failed to delete family. The operation was rolled back.' });
  }
});

export default router;
