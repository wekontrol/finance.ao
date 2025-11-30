import { Router, Request, Response } from 'express';
import pgPool from '../db/postgres';

const router = Router();

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

router.use(requireAuth);

// Get notification preferences for current user
router.get('/preferences', async (req: Request, res: Response) => {
  const userId = req.session!.userId as string;
  const user = req.session!.user as any;
  const isSuperAdmin = user && user.role === 'SUPER_ADMIN';

  try {
    if (isSuperAdmin) {
      // Get global preferences for super admin
      const globalResult = await pgPool.query(`
        SELECT * FROM notification_preferences WHERE is_global = true
      `);
      const global = globalResult.rows[0];
      
      if (!global) {
        const id = `np${Date.now()}`;
        await pgPool.query(`
          INSERT INTO notification_preferences (id, is_global, budget_alerts, subscription_alerts, financial_tips, goal_progress, email_notifications, push_notifications)
          VALUES ($1, true, true, true, true, true, true, true)
        `, [id]);
        const createdResult = await pgPool.query(`SELECT * FROM notification_preferences WHERE id = $1`, [id]);
        return res.json(createdResult.rows[0]);
      }
      res.json(global);
    } else {
      // Get user-specific preferences
      const prefsResult = await pgPool.query(`
        SELECT * FROM notification_preferences WHERE user_id = $1 AND is_global = false
      `, [userId]);
      const prefs = prefsResult.rows[0];
      
      if (!prefs) {
        const id = `np${Date.now()}`;
        await pgPool.query(`
          INSERT INTO notification_preferences (id, user_id, is_global, budget_alerts, subscription_alerts, financial_tips, goal_progress, email_notifications, push_notifications)
          VALUES ($1, $2, false, true, true, true, true, true, true)
        `, [id, userId]);
        const createdResult = await pgPool.query(`SELECT * FROM notification_preferences WHERE id = $1`, [id]);
        return res.json(createdResult.rows[0]);
      }
      res.json(prefs);
    }
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    res.status(500).json({ error: 'Failed to fetch notification preferences' });
  }
});

// Update notification preferences
router.post('/preferences', async (req: Request, res: Response) => {
  const userId = req.session!.userId as string;
  const user = req.session!.user as any;
  const { budget_alerts, subscription_alerts, financial_tips, goal_progress, email_notifications, push_notifications } = req.body;
  const isSuperAdmin = user && user.role === 'SUPER_ADMIN';

  try {
    if (isSuperAdmin) {
      // Update global preferences
      await pgPool.query(`
        UPDATE notification_preferences 
        SET budget_alerts = $1, subscription_alerts = $2, financial_tips = $3, goal_progress = $4, email_notifications = $5, push_notifications = $6
        WHERE is_global = true
      `, [budget_alerts, subscription_alerts, financial_tips, goal_progress, email_notifications, push_notifications]);
    } else {
      // Update user-specific preferences
      await pgPool.query(`
        UPDATE notification_preferences 
        SET budget_alerts = $1, subscription_alerts = $2, financial_tips = $3, goal_progress = $4, email_notifications = $5, push_notifications = $6
        WHERE user_id = $7 AND is_global = false
      `, [budget_alerts, subscription_alerts, financial_tips, goal_progress, email_notifications, push_notifications, userId]);
    }

    res.json({ message: 'Preferences updated' });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

export default router;
