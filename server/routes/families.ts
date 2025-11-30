import { Router, Request, Response } from 'express';
import pgPool from '../db/postgres';

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
router.get('/', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pgPool.query(`
      SELECT 
        f.id,
        f.name,
        f.created_at,
        COUNT(u.id) as member_count
      FROM families f
      LEFT JOIN users u ON f.id = u.family_id
      GROUP BY f.id, f.name, f.created_at
      ORDER BY f.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch families:', error);
    res.status(500).json({ error: 'Failed to fetch families' });
  }
});

// DELETE family (Super Admin only)
router.delete('/:id', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;

  // Don't allow deleting the default admin family
  if (id === 'fam_admin') {
    return res.status(403).json({ error: 'Cannot delete the default admin family' });
  }

  // Check if family exists
  const familyResult = await pgPool.query('SELECT id FROM families WHERE id = $1', [id]);
  if (familyResult.rows.length === 0) {
    return res.status(404).json({ error: 'Family not found' });
  }

  const client = await pgPool.connect();
  
  try {
    await client.query('BEGIN');

    // Get all user IDs from the family
    const usersResult = await client.query('SELECT id FROM users WHERE family_id = $1', [id]);
    const userIds = usersResult.rows.map((u: { id: string }) => u.id);

    if (userIds.length > 0) {
      // Delete data linked to users
      await client.query(
        `DELETE FROM transactions WHERE user_id = ANY($1)`,
        [userIds]
      );
      await client.query(
        `DELETE FROM savings_goals WHERE user_id = ANY($1)`,
        [userIds]
      );
      await client.query(
        `DELETE FROM budget_limits WHERE user_id = ANY($1)`,
        [userIds]
      );
    }

    // Delete data linked to the family directly
    await client.query('DELETE FROM family_tasks WHERE family_id = $1', [id]);
    await client.query('DELETE FROM family_events WHERE family_id = $1', [id]);

    // Finally, delete users and the family itself
    await client.query('DELETE FROM users WHERE family_id = $1', [id]);
    await client.query('DELETE FROM families WHERE id = $1', [id]);

    await client.query('COMMIT');
    
    res.json({ message: 'Family and all associated data deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to delete family:', error);
    res.status(500).json({ error: 'Failed to delete family. The operation was rolled back.' });
  } finally {
    client.release();
  }
});

export default router;
